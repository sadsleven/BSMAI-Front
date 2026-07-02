import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  effectiveTaxAmountBs,
  obligationProviderId,
  recipientName,
  type TaxBatch,
  type TaxInvoiceRow,
  type TaxObligation,
} from '../../domain/models/taxesPayable';

/** Agente de retención (AFMI) — datos fijos del encabezado del comprobante. */
const AGENT = {
  rifHeader: 'RIF: J501902828',
  name: 'ATENCIÓN FAMILIAR MÉDICO INTEGRAL (AFMI), C.A.',
  address:
    'CALLE BOMPLANT EDIFICIO COROMOTO PLANTA BAJA N.º 08 y 09 SECTOR GRAN MARISCAL',
  rif: 'J-50190282-8',
  phone: '0293-4337343',
};

const LEGAL_TEXT =
  '(DECRETO 1808 RET.ISLR ART 1) Están obligados a practicar la retención del impuesto en el momento del pago o del abono en cuenta y a entéralo en una oficina receptora de fondos nacionales de los plazos , condiciones y formas reglamentarias aquí establecidas, los deudores o pagadores de lo siguientes enriquecimientos o ingresos brutos a los que se refieren los art . 27,32,35,36,37,39,40,41,42,51,53,65,66 y 68 de la Ley de I.S.L.R';

const TITLE = 'COMPROBANTE DE RETENCION DE IMPUESTO SOBRE LA RENTA';

/** Código SENIAT del concepto: honorarios profesionales no mercantiles. */
const SENIAT_CONCEPT_CODE = '002';

// ---- Estilos (Calibri, espejo de los templates Excel del proyecto) ----
const font = (opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: 'Calibri',
  size: 9,
  ...opts,
});
const RIF_BLUE = font({ bold: true, color: { argb: 'FF002060' } });

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};
const SOFT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2F2F2' },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const HAIR_BOTTOM: Partial<ExcelJS.Border> = {
  style: 'hair',
  color: { argb: 'FFB0B0B0' },
};

export interface IslrComprobanteOptions {
  /** Nº de comprobante SENIAT, p. ej. "20260600000079". */
  comprobanteNumber: string;
  /** Fecha de emisión ISO (YYYY-MM-DD). Define también el período fiscal. */
  issueDate: string;
}

/** Carga la imagen del logo AFMI desde public/. Devuelve null si falla. */
async function loadLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const url = `${import.meta.env.BASE_URL}excel-image.png`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.arrayBuffer();
  } catch {
    return null;
  }
}

function safeFilenameSegment(s: string): string {
  const cleaned = Array.from(s)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || '<>:"/\\|?*'.includes(ch)) return '_';
      return ch;
    })
    .join('');
  return cleaned.trim().slice(0, 80) || 'sin_nombre';
}

function safeSheetName(s: string): string {
  const cleaned = Array.from(s)
    .map((ch) => ('[]*?:/\\'.includes(ch) ? ' ' : ch))
    .join('')
    .trim();
  return (cleaned || 'Sujeto').slice(0, 31);
}

function ddmmyyyy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Borde exterior (caja) sobre un rango, preservando bordes ya aplicados. */
function outlineBox(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
      if (r === r1) b.top = { style: 'thin' };
      if (r === r2) b.bottom = { style: 'thin' };
      if (c === c1) b.left = { style: 'thin' };
      if (c === c2) b.right = { style: 'thin' };
      cell.border = b;
    }
  }
}

/** RIF/cédula del sujeto retenido según su tipo. */
function subjectDocument(o: TaxObligation): string {
  if (o.recipientType === 'doctor') {
    return (o.doctor?.isLegalEntity ? o.doctor?.rif : o.doctor?.cedula) ?? '';
  }
  return o.careCenter?.rif ?? '';
}

/** Dirección fiscal del sujeto retenido (sólo doctores la registran). */
function subjectAddress(o: TaxObligation): string {
  if (o.recipientType === 'doctor') return o.doctor?.centerAddress ?? '';
  return '';
}

/** Filas de factura de una obligación (fallback si el BE no envió `invoices`). */
function invoiceRowsOf(o: TaxObligation): TaxInvoiceRow[] {
  if (o.invoices && o.invoices.length > 0) return o.invoices;
  return [
    {
      orderId: '',
      orderNumber: '',
      internalNumber: (o.internalNumbers ?? []).join(', '),
      invoiceNumber: (o.internalNumbers ?? []).join(', ') || null,
      controlNumber: null,
      invoiceDate: o.createdAt ?? '',
      grossBs: Number(o.grossAmountBs) || 0,
    },
  ];
}

/**
 * Reparte la retención efectiva de la obligación entre sus facturas de forma
 * proporcional al bruto (la última fila absorbe el redondeo, para que la suma
 * cuadre exacta con lo enterado al SENIAT).
 */
function allocateRetention(rows: TaxInvoiceRow[], totalRetentionBs: number): number[] {
  const totalGross = rows.reduce((s, r) => s + (Number(r.grossBs) || 0), 0);
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === rows.length - 1) {
      out.push(round2(totalRetentionBs - assigned));
      break;
    }
    const share =
      totalGross > 0
        ? round2((totalRetentionBs * (Number(rows[i].grossBs) || 0)) / totalGross)
        : 0;
    out.push(share);
    assigned = round2(assigned + share);
  }
  return out;
}

interface ProviderGroup {
  name: string;
  obligations: TaxObligation[];
}

function groupByProvider(batch: TaxBatch): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const o of batch.obligations ?? []) {
    const key = `${o.recipientType}:${obligationProviderId(o)}`;
    const g = groups.get(key) ?? { name: recipientName(o), obligations: [] };
    g.obligations.push(o);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * COMPROBANTE DE RETENCION DE IMPUESTO SOBRE LA RENTA (Decreto 1.808) del lote
 * SENIAT. Sigue la planilla ISLR de la empresa: una hoja por sujeto retenido
 * (proveedor), con una fila por factura de las órdenes de origen. Si el lote
 * tiene ajuste de UT, los montos retenidos usan los valores ajustados.
 */
export async function downloadIslrComprobanteXlsx(
  batch: TaxBatch,
  opts: IslrComprobanteOptions,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = AGENT.name;
  wb.created = new Date();

  const logoBuf = await loadLogoBuffer();
  const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null;

  const issue = new Date(`${opts.issueDate}T00:00:00`);
  const fiscalYear = issue.getFullYear();
  const fiscalMonth = String(issue.getMonth() + 1).padStart(2, '0');

  const groups = groupByProvider(batch);
  const usedNames = new Set<string>();

  for (const group of groups) {
    let sheetName = safeSheetName(group.name);
    let suffix = 2;
    while (usedNames.has(sheetName.toLowerCase())) {
      sheetName = `${safeSheetName(group.name).slice(0, 28)} ${suffix++}`;
    }
    usedNames.add(sheetName.toLowerCase());
    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    buildProviderSheet(ws, group, issue, fiscalYear, fiscalMonth, opts, logoId);
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Comprobante-ISLR-${safeFilenameSegment(
    opts.comprobanteNumber,
  )}-Lote-${safeFilenameSegment(batch.taxBatchNumber)}.xlsx`;
  saveAs(new Blob([buf]), filename);
}

function buildProviderSheet(
  ws: ExcelJS.Worksheet,
  group: ProviderGroup,
  issue: Date,
  fiscalYear: number,
  fiscalMonth: string,
  opts: IslrComprobanteOptions,
  logoId: number | null,
): void {
  ws.columns = [
    { width: 4.3 }, // A (margen)
    { width: 12 }, // B Oper.Nro.
    { width: 13 }, // C Fecha factura
    { width: 15.5 }, // D N° factura
    { width: 16 }, // E N° control
    { width: 13 }, // F Monto total
    { width: 14 }, // G Base imponible
    { width: 13 }, // H % retención
    { width: 23 }, // I ISLR retenido
  ];

  // Logo AFMI anclado a B1 (mismo asset/tamaño que las órdenes internas).
  if (logoId !== null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  // --- Fecha / Nº comprobante ---
  ws.getCell('G1').value = 'FECHA';
  ws.mergeCells('H1:I1');
  ws.getCell('H1').value = 'Nº COMPROBANTE';
  for (const addr of ['G1', 'H1']) {
    const c = ws.getCell(addr);
    c.font = font({ bold: true });
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
    c.fill = HEADER_FILL;
  }
  ws.getCell('G2').value = issue;
  ws.getCell('G2').numFmt = 'dd/mm/yyyy';
  ws.mergeCells('H2:I2');
  ws.getCell('H2').value = opts.comprobanteNumber;
  ws.getCell('H2').numFmt = '@';
  for (const addr of ['G2', 'H2']) {
    const c = ws.getCell(addr);
    c.font = font({ size: 10 });
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  }
  outlineBox(ws, 1, 7, 2, 9);

  // --- Título ---
  ws.mergeCells('B3:C3');
  ws.getCell('B3').value = AGENT.rifHeader;
  ws.getCell('B3').font = RIF_BLUE;
  ws.getRow(4).height = 18;
  ws.mergeCells('B4:F4');
  ws.getCell('B4').value = TITLE;
  ws.getCell('B4').font = font({ bold: true, size: 12 });
  ws.getCell('B4').alignment = { vertical: 'middle' };
  ws.mergeCells('B5:F5');
  ws.getCell('B5').value = LEGAL_TEXT;
  ws.getCell('B5').font = font({ size: 8 });
  ws.getCell('B5').alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(5).height = 66;
  ws.mergeCells('G5:I5');
  ws.getCell('G5').value =
    `PERIODO FISCAL:      AÑO:  ${fiscalYear}      MES: ${fiscalMonth}`;
  ws.getCell('G5').font = font({ bold: true, size: 10 });
  ws.getCell('G5').alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
  ws.getCell('G5').border = THIN_BORDER;
  ws.getCell('G5').fill = SOFT_FILL;
  outlineBox(ws, 5, 7, 5, 9);

  // --- Datos del agente de retención ---
  ws.getRow(7).height = 16;
  ws.mergeCells('B7:I7');
  const agentHeader = ws.getCell('B7');
  agentHeader.value = 'DATOS DEL AGENTE DE RETENCION';
  agentHeader.font = font({ bold: true, size: 10 });
  agentHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  agentHeader.fill = HEADER_FILL;
  agentHeader.border = THIN_BORDER;

  const agentRows: Array<[string, string]> = [
    ['NOMBRE O RAZON SOCIAL:', AGENT.name],
    ['DIRECCION FISCAL:', AGENT.address],
    ['RIF.', AGENT.rif],
    ['TELEFONOS:', AGENT.phone],
  ];
  agentRows.forEach(([label, value], i) => {
    const r = 8 + i;
    ws.mergeCells(`B${r}:D${r}`);
    ws.getCell(`B${r}`).value = label;
    ws.getCell(`B${r}`).font = font({ bold: true });
    ws.mergeCells(`E${r}:I${r}`);
    ws.getCell(`E${r}`).value = value;
    ws.getCell(`E${r}`).font = font();
    for (let c = 5; c <= 9; c++) {
      ws.getCell(r, c).border = { ...(ws.getCell(r, c).border ?? {}), bottom: HAIR_BOTTOM };
    }
  });
  outlineBox(ws, 7, 2, 11, 9);

  // --- Datos del sujeto retenido ---
  ws.getRow(12).height = 16;
  ws.mergeCells('B12:I12');
  const subjectHeader = ws.getCell('B12');
  subjectHeader.value = 'DATOS DEL SUJETO RETENIDO';
  subjectHeader.font = font({ bold: true, size: 10 });
  subjectHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  subjectHeader.fill = HEADER_FILL;
  subjectHeader.border = THIN_BORDER;

  const first = group.obligations[0];
  const subjectRows: Array<[string, string]> = [
    ['NOMBRE O RAZON SOCIAL:', group.name],
    ['DIRECCION FISCAL:', subjectAddress(first)],
    ['RIF.', subjectDocument(first)],
    ['TELEFONOS:', ''],
  ];
  subjectRows.forEach(([label, value], i) => {
    const r = 13 + i;
    ws.mergeCells(`B${r}:D${r}`);
    ws.getCell(`B${r}`).value = label;
    ws.getCell(`B${r}`).font = font({ bold: true });
    ws.mergeCells(`E${r}:I${r}`);
    ws.getCell(`E${r}`).value = value;
    ws.getCell(`E${r}`).font = font();
    ws.getCell(`E${r}`).numFmt = '@';
    for (let c = 5; c <= 9; c++) {
      ws.getCell(r, c).border = { ...(ws.getCell(r, c).border ?? {}), bottom: HAIR_BOTTOM };
    }
  });
  outlineBox(ws, 12, 2, 16, 9);

  ws.mergeCells('E17:H17');
  ws.getCell('E17').value = 'CODIGO DEL CONCEPTO DE RETENCIÓN SENIAT';
  ws.getCell('E17').font = font({ bold: true });
  ws.getCell('E17').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('I17').value = SENIAT_CONCEPT_CODE;
  ws.getCell('I17').numFmt = '@';
  ws.getCell('I17').font = font({ bold: true, size: 10 });
  ws.getCell('I17').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I17').border = THIN_BORDER;
  ws.getCell('I17').fill = SOFT_FILL;

  // --- Tabla de facturas ---
  const tableHeaders = [
    'Oper.Nro.',
    'FECHA DE LA  FACTURA',
    'NUMERO FACTURA',
    'NUMERO CONTROL DE LA FACTURA',
    'MONTO TOTAL ',
    'BASE IMPONIBLE',
    '% RETENCION',
    'ISLR RETENIDO',
  ];
  const headerRow = 19;
  ws.getRow(headerRow).height = 40;
  tableHeaders.forEach((h, i) => {
    const c = ws.getCell(headerRow, 2 + i); // B..I
    c.value = h;
    c.font = font({ bold: true });
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = HEADER_FILL;
    c.border = THIN_BORDER;
  });

  let r = headerRow + 1;
  const firstDataRow = r;
  let oper = 1;
  for (const o of group.obligations) {
    const invoices = invoiceRowsOf(o);
    const retentions = allocateRetention(invoices, effectiveTaxAmountBs(o));
    const rate = Number(o.taxRate) || 0;
    invoices.forEach((inv, i) => {
      ws.getRow(r).height = 15;
      ws.getCell(r, 2).value = String(oper).padStart(2, '0');
      ws.getCell(r, 2).numFmt = '@';
      ws.getCell(r, 3).value = ddmmyyyy(inv.invoiceDate);
      ws.getCell(r, 3).numFmt = '@';
      ws.getCell(r, 4).value = inv.invoiceNumber ?? '';
      ws.getCell(r, 4).numFmt = '@';
      ws.getCell(r, 5).value = inv.controlNumber ?? '';
      ws.getCell(r, 5).numFmt = '@';
      ws.getCell(r, 6).value = round2(Number(inv.grossBs) || 0);
      ws.getCell(r, 7).value = { formula: `F${r}` } as ExcelJS.CellFormulaValue;
      ws.getCell(r, 8).value = rate;
      ws.getCell(r, 8).numFmt = '0%';
      ws.getCell(r, 8).alignment = { horizontal: 'center' };
      ws.getCell(r, 9).value = retentions[i] ?? 0;
      for (const col of [2, 3, 4, 5]) {
        ws.getCell(r, col).alignment = { horizontal: 'center' };
      }
      for (const col of [6, 7, 9]) ws.getCell(r, col).numFmt = '#,##0.00';
      for (let col = 2; col <= 9; col++) {
        ws.getCell(r, col).border = THIN_BORDER;
        ws.getCell(r, col).font = font();
      }
      oper++;
      r++;
    });
  }

  // --- Totales ---
  const lastDataRow = r - 1;
  ws.getRow(r).height = 15;
  ws.getCell(r, 5).value = 'TOTALES';
  ws.getCell(r, 5).font = font({ bold: true });
  ws.getCell(r, 5).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(r, 5).fill = SOFT_FILL;
  ws.getCell(r, 5).border = THIN_BORDER;
  for (const col of [6, 7, 8, 9]) {
    const cell = ws.getCell(r, col);
    if (col !== 8) {
      const letter = String.fromCharCode(64 + col); // F, G, I
      cell.value = {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
      } as ExcelJS.CellFormulaValue;
      cell.numFmt = '#,##0.00';
    }
    cell.font = font({ bold: true });
    cell.fill = SOFT_FILL;
    cell.border = THIN_BORDER;
  }
  const totalsRow = r;
  r++;

  ws.getRow(r).height = 16;
  ws.mergeCells(`G${r}:H${r}`);
  ws.getCell(`G${r}`).value = 'Total ISLR  Retenido Bs.';
  ws.getCell(`G${r}`).font = font({ bold: true, size: 10 });
  ws.getCell(`G${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(`G${r}`).fill = HEADER_FILL;
  ws.getCell(`G${r}`).border = THIN_BORDER;
  ws.getCell(`H${r}`).border = THIN_BORDER;
  ws.getCell(`I${r}`).value = {
    formula: `I${totalsRow}`,
  } as ExcelJS.CellFormulaValue;
  ws.getCell(`I${r}`).numFmt = '#,##0.00';
  ws.getCell(`I${r}`).font = font({ bold: true, size: 10 });
  ws.getCell(`I${r}`).fill = HEADER_FILL;
  ws.getCell(`I${r}`).border = THIN_BORDER;
  r += 4;

  // --- Firmas ---
  ws.mergeCells(`B${r}:E${r}`);
  ws.getCell(`B${r}`).value = ' SELLO Y FIRMA DEL AGENTE DE RETENCIÓN';
  ws.getCell(`B${r}`).font = font({ bold: true });
  ws.getCell(`B${r}`).border = { top: { style: 'thin' } };
  ws.getCell(`F${r}`).border = {};
  ws.mergeCells(`G${r}:I${r}`);
  ws.getCell(`G${r}`).value = 'RECIBIDO POR:';
  ws.getCell(`G${r}`).font = font({ bold: true });
  ws.getCell(`G${r}`).border = { top: { style: 'thin' } };
  r++;
  ws.mergeCells(`G${r}:I${r}`);
  ws.getCell(`G${r}`).value = 'FECHA DE RECEPCION:  ';
  ws.getCell(`G${r}`).font = font();
}
