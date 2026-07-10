import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeFilenameSegment } from '@/modules/orders/presentation/components/orderExcel';
import type { ArcBeneficiary, ArcReport } from '../../infrastructure/reportsGateway';

/**
 * Comprobante ARC — Agente de Retención (Decreto 1.808). Emite una hoja por
 * beneficiario (proveedor) con sus datos, los del agente (AFMI) y la tabla del
 * impuesto retenido y enterado del ejercicio fiscal. Sigue el formato oficial
 * SENIAT del comprobante de agente de retención de ISLR.
 */

/** Agente de retención (AFMI) — datos fijos del encabezado. */
const AGENT = {
  name: 'ATENCIÓN FAMILIAR MÉDICO INTEGRAL (AFMI), C.A.',
  rif: 'J-50190282-8',
  address:
    'CALLE BOMPLANT EDIFICIO COROMOTO PLANTA BAJA N.º 08 y 09 SECTOR GRAN MARISCAL',
  phone: '0293-4337343',
};

const TITLE_1 =
  'ESTE COMPROBANTE SE EMITE SEGÚN ESTABLECE LA REFORMA PARCIAL DEL REGLAMENTO DE LA LEY DE';
const TITLE_2 =
  'IMPUESTO SOBRE LA RENTA EN MATERIA DE RETENCIONES, DECRETO 1.808';

const font = (opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: 'Calibri',
  size: 9,
  ...opts,
});

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const THIN_BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };

function safeSheetName(s: string, used: Set<string>): string {
  const clean = Array.from(s)
    .map((ch) => ('[]*?:/\\'.includes(ch) ? ' ' : ch))
    .join('')
    .trim()
    .slice(0, 28) || 'Beneficiario';
  let name = clean;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    name = `${clean.slice(0, 25)} ${i}`;
    i += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/** YYYY-MM-DD → Date anclado a mediodía UTC (evita el día-1 en VE). */
function dateCell(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Borde exterior (caja) sobre un rango, preservando bordes ya aplicados. */
function outlineBox(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
      if (r === r1) b.top = THIN;
      if (r === r2) b.bottom = THIN;
      if (c === c1) b.left = THIN;
      if (c === c2) b.right = THIN;
      cell.border = b;
    }
  }
}

function buildBeneficiarySheet(
  ws: ExcelJS.Worksheet,
  b: ArcBeneficiary,
  period: ArcReport['period'],
): void {
  ws.columns = [
    { width: 15 }, // A FECHA
    { width: 16 }, // B CANTIDAD OBJETO
    { width: 9 }, // C % TARIFA
    { width: 15 }, // D IMPUESTO RETENIDO
    { width: 18 }, // E TOTAL RETENCION ACUM
    { width: 16 }, // F IMPUESTO RET ACUM
    { width: 13 }, // G EN FECHA
    { width: 14 }, // H BANCO
  ];

  // --- Encabezado SENIAT + título ---
  ws.getCell('A1').value = 'SENIAT';
  ws.getCell('A1').font = font({ bold: true });
  ws.mergeCells('B1:H1');
  ws.getCell('B1').value = TITLE_1;
  ws.getCell('B1').font = font({ bold: true });
  ws.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('B2:H2');
  ws.getCell('B2').value = TITLE_2;
  ws.getCell('B2').font = font({ bold: true });
  ws.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };

  // --- Etiquetas de sección ---
  ws.getCell('A4').value = 'DATOS DEL AGENTE DE RETENCION';
  ws.getCell('A4').font = font({ bold: true });
  ws.getCell('E4').value = 'DATOS DEL BENEFICIARIO';
  ws.getCell('E4').font = font({ bold: true });

  const lbl = (addr: string, text: string, wrap = false) => {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = font({ size: 8 });
    c.alignment = { vertical: 'top', wrapText: wrap };
  };
  const val = (addr: string, text: ExcelJS.CellValue, bold = true, wrap = false) => {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = font({ bold, size: 9 });
    c.alignment = { vertical: 'top', wrapText: wrap };
    c.numFmt = '@';
  };

  // --- Caja AGENTE (A5:D12), split 2+2 ---
  ws.mergeCells('A5:B5'); lbl('A5', 'Nombre o razón social');
  ws.mergeCells('C5:D5'); lbl('C5', 'Número de R.I.F.');
  ws.mergeCells('A6:B6'); val('A6', AGENT.name, true, true);
  ws.mergeCells('C6:D6'); val('C6', AGENT.rif, true); ws.getCell('C6').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('A7:B7'); lbl('A7', 'Dirección y Teléfono (s)');
  ws.mergeCells('C7:D7'); lbl('C7', 'Fecha de cierre del ejercicio'); ws.getCell('C7').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.mergeCells('A8:B12'); val('A8', `${AGENT.address}\nTel: ${AGENT.phone}`, false, true);
  ws.getCell('C8').value = 'DIA'; ws.getCell('D8').value = 'MES';
  ws.getCell('C9').value = 31; ws.getCell('D9').value = 12;
  for (const a of ['C8', 'D8']) { ws.getCell(a).font = font({ bold: true, size: 8 }); ws.getCell(a).alignment = { horizontal: 'center' }; ws.getCell(a).border = THIN_BORDER; }
  for (const a of ['C9', 'D9']) { ws.getCell(a).font = font(); ws.getCell(a).alignment = { horizontal: 'center' }; ws.getCell(a).border = THIN_BORDER; }
  ws.mergeCells('C10:D12');
  outlineBox(ws, 5, 1, 12, 4);

  // --- Caja BENEFICIARIO (E5:H12), split 2+2 ---
  const natural = b.personType !== 'legal_entity';
  ws.mergeCells('E5:F5'); lbl('E5', 'Apellido (s) o Nombre (s) o Razón Social');
  ws.mergeCells('G5:H5'); lbl('G5', 'Tipo de persona');
  ws.mergeCells('E6:F6'); val('E6', b.name, true, true);
  ws.mergeCells('G6:H6');
  ws.getCell('G6').value = `Natural: [${natural ? 'X' : ' '}]     Jurídica: [${natural ? ' ' : 'X'}]`;
  ws.getCell('G6').font = font({ size: 9 });
  ws.getCell('G6').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('E7:F7'); lbl('E7', 'Cédula de Identidad:');
  ws.mergeCells('G7:H7'); lbl('G7', 'Número de R.I.F.');
  ws.mergeCells('E8:F8'); val('E8', b.cedula ?? ''); ws.getCell('E8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('G8:H8'); val('G8', b.rif ?? ''); ws.getCell('G8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('E9:F9'); lbl('E9', 'Dirección y Teléfono (s):');
  ws.mergeCells('G9:H9'); lbl('G9', 'Período a que corresponden las remuneraciones pagadas', true);
  ws.mergeCells('E10:F12');
  val('E10', `${b.address ?? ''}${b.phone ? `\nTel: ${b.phone}` : ''}`, false, true);
  ws.mergeCells('G10:H10');
  ws.getCell('G10').value = `DESDE: ${period.from.slice(8, 10)}-${period.from.slice(5, 7)}-${period.from.slice(0, 4)}`;
  ws.getCell('G10').font = font({ size: 9 });
  ws.mergeCells('G11:H11');
  ws.getCell('G11').value = `HASTA: ${period.to.slice(8, 10)}-${period.to.slice(5, 7)}-${period.to.slice(0, 4)}`;
  ws.getCell('G11').font = font({ size: 9 });
  ws.mergeCells('G12:H12');
  outlineBox(ws, 5, 5, 12, 8);

  // --- Título de la tabla ---
  ws.getCell('A14').value = 'INFORMACION DEL IMPUESTO RETENIDO Y ENTERADO';
  ws.getCell('A14').font = font({ bold: true });

  // --- Cabecera de la tabla (2 filas) ---
  const H = 15;
  const cols: Array<[number, string]> = [
    [1, 'FECHA DE PAGO O ABONO EN CUENTA (DIA MES AÑO)'],
    [2, 'CANTIDAD OBJETO DE RETENCION'],
    [3, '% O TARIFA'],
    [4, 'IMPUESTO RETENIDO'],
    [5, 'TOTAL CANTIDAD DE RETENCION ACUMULADA'],
    [6, 'IMPUESTO RETENIDO ACUMULADO'],
  ];
  for (const [c, text] of cols) {
    ws.mergeCells(H, c, H + 1, c);
    const cell = ws.getCell(H, c);
    cell.value = text;
    cell.font = font({ bold: true, size: 8 });
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = HEADER_FILL;
  }
  ws.mergeCells(H, 7, H, 8);
  ws.getCell(H, 7).value = 'IMPUESTO ENTERADO';
  ws.getCell(H, 7).font = font({ bold: true, size: 8 });
  ws.getCell(H, 7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(H, 7).fill = HEADER_FILL;
  ws.getCell(H + 1, 7).value = 'EN FECHA';
  ws.getCell(H + 1, 8).value = 'BANCO';
  for (const c of [7, 8]) {
    const cell = ws.getCell(H + 1, c);
    cell.font = font({ bold: true, size: 8 });
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = HEADER_FILL;
  }
  ws.getRow(H).height = 34;
  for (let c = 1; c <= 8; c++) {
    ws.getCell(H, c).border = THIN_BORDER;
    ws.getCell(H + 1, c).border = THIN_BORDER;
  }

  // --- Filas de datos ---
  let r = H + 2;
  const firstDataRow = r;
  for (const line of b.lines) {
    const cells: Array<[number, ExcelJS.CellValue, string?, Partial<ExcelJS.Alignment>?]> = [
      [1, dateCell(line.paymentDate), 'dd/mm/yyyy', { horizontal: 'center' }],
      [2, line.baseBs, '#,##0.00'],
      [3, line.ratePct / 100, '0%', { horizontal: 'center' }],
      [4, line.retainedBs, '#,##0.00'],
      [5, line.accBaseBs, '#,##0.00'],
      [6, line.accRetainedBs, '#,##0.00'],
      [7, dateCell(line.enteradoDate), 'dd/mm/yyyy', { horizontal: 'center' }],
      [8, line.enteradoBank ?? '', '@', { horizontal: 'center' }],
    ];
    for (const [c, v, numFmt, align] of cells) {
      const cell = ws.getCell(r, c);
      cell.value = v;
      cell.font = font();
      if (numFmt) cell.numFmt = numFmt;
      cell.alignment = align ?? { horizontal: 'right' };
      cell.border = THIN_BORDER;
    }
    r += 1;
  }
  const lastDataRow = r - 1;

  // --- Fila de TOTALES ---
  for (let c = 1; c <= 8; c++) {
    ws.getCell(r, c).border = THIN_BORDER;
    ws.getCell(r, c).font = font({ bold: true });
    ws.getCell(r, c).fill = HEADER_FILL;
  }
  ws.getCell(r, 1).value = 'TOTALES';
  ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  const sumFormula = (letter: string, fallback: number) =>
    b.lines.length > 0
      ? ({ formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, result: fallback } as ExcelJS.CellFormulaValue)
      : fallback;
  ws.getCell(r, 2).value = sumFormula('B', b.totalBaseBs);
  ws.getCell(r, 4).value = sumFormula('D', b.totalRetainedBs);
  ws.getCell(r, 5).value = b.totalBaseBs;
  ws.getCell(r, 6).value = b.totalRetainedBs;
  for (const c of [2, 4, 5, 6]) {
    ws.getCell(r, c).numFmt = '#,##0.00';
    ws.getCell(r, c).alignment = { horizontal: 'right' };
  }

  // --- Firma ---
  r += 2;
  ws.getCell(r, 1).value = 'Agente de retención (sello, fecha y firma)';
  ws.getCell(r, 1).font = font({ size: 8 });
}

export async function downloadArcXlsx(report: ArcReport): Promise<void> {
  if (!report.beneficiaries.length) {
    throw new Error('No hay retenciones en el período para generar el ARC');
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = AGENT.name;

  const used = new Set<string>();
  for (const b of report.beneficiaries) {
    const ws = wb.addWorksheet(safeSheetName(b.name, used), {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    buildBeneficiarySheet(ws, b, report.period);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const single = report.beneficiaries.length === 1;
  const filename = single
    ? `ARC-${report.period.year}-${safeFilenameSegment(report.beneficiaries[0].name)}.xlsx`
    : `ARC-${report.period.year}-beneficiarios.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}
