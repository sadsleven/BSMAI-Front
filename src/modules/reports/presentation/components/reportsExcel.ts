import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeFilenameSegment } from '@/modules/orders/presentation/components/orderExcel';
import type {
  ReportInvoiceRow,
  ReportPayablePayment,
  ReportPayableRow,
  ReportReceivableRow,
} from '../../infrastructure/reportsGateway';
import { formatBs } from '../../domain/format';

const COMPANY = {
  name: 'ATENCIÓN MÉDICA AFMI',
  rif: 'J-50190282-8',
};

const F8: Partial<ExcelJS.Font> = { name: 'Calibri', size: 8 };
const F8B: Partial<ExcelJS.Font> = { ...F8, bold: true };
const F9: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9 };
const F9B: Partial<ExcelJS.Font> = { ...F9, bold: true };
const F11B: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true };
const F12B: Partial<ExcelJS.Font> = { name: 'Calibri', size: 12, bold: true };
const F_RIF: Partial<ExcelJS.Font> = { ...F9B, color: { argb: 'FF002060' } };

function thin(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, left: s, right: s, bottom: s };
}

/** Carga el logo AFMI desde public/. Devuelve null si falla. */
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

/**
 * Fecha-solo (`YYYY-MM-DD`) → Date anclado a mediodía UTC. ExcelJS interpreta
 * los Date en UTC; anclar a mediodía evita imprimir el día anterior en VE (UTC-4).
 */
function dateCell(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12));
}

// ===========================================================================
// EXPORTADOR GENÉRICO DE TABLA — logo AFMI + RIF + título + totales
// Reutilizado por el resto de los reportes con tabla de listado.
// ===========================================================================

const round2g = (n: number): number => Math.round(n * 100) / 100;

/** 1→A, 26→Z, 27→AA … */
function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export interface ReportColumn<T> {
  header: string;
  /** Valor de celda; recibe la fila y su índice (0-based). */
  value: (row: T, index: number) => ExcelJS.CellValue;
  width?: number;
  numFmt?: string;
  align?: 'left' | 'center' | 'right';
  /** Si true, suma la columna (numérica) en la fila de totales. */
  total?: boolean;
}

/**
 * Genera un Excel con la identidad AFMI (logo + RIF), título, cabecera, filas y
 * una fila de totales para las columnas marcadas `total`. Formato consistente
 * con los reportes de cuentas por cobrar/pagar.
 */
export async function downloadReportTableXlsx<T>(opts: {
  filename: string;
  title: string;
  sheetName?: string;
  columns: ReportColumn<T>[];
  rows: T[];
}): Promise<void> {
  const { columns, rows } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  const ws = wb.addWorksheet((opts.sheetName ?? 'REPORTE').slice(0, 31), {
    views: [{ showGridLines: true }],
  });

  const lastCol = columns.length;
  const lastColLetter = colLetter(lastCol);
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 16;
  });

  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  // Título centrado (empieza en col B para no pisar el logo de col A).
  const titleStart = lastCol >= 2 ? 'B' : 'A';
  ws.mergeCells(`${titleStart}2:${lastColLetter}2`);
  const title = ws.getCell(`${titleStart}2`);
  title.value = opts.title.toUpperCase();
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  const rif = ws.getCell('A4');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  // Cabecera (fila 6).
  const headerRow = ws.getRow(6);
  headerRow.height = 40;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  // Datos (desde fila 7).
  const totals = columns.map(() => 0);
  let rowNum = 7;
  rows.forEach((r, idx) => {
    const row = ws.getRow(rowNum);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.value(r, idx);
      cell.value = v;
      cell.font = F8;
      cell.alignment = { horizontal: c.align ?? (typeof v === 'number' ? 'right' : 'left') };
      if (c.numFmt && v !== '' && v != null) cell.numFmt = c.numFmt;
      cell.border = thin();
      if (c.total && typeof v === 'number' && Number.isFinite(v)) totals[i] += v;
    });
    rowNum += 1;
  });

  // Fila de totales.
  const anyTotal = columns.some((c) => c.total);
  if (anyTotal && rows.length > 0) {
    const totalsRow = ws.getRow(rowNum);
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = totalsRow.getCell(col);
      cell.font = F8B;
      cell.border = thin();
    }
    const labelIdx = columns.findIndex((c) => !c.total);
    const labelCell = totalsRow.getCell((labelIdx < 0 ? 0 : labelIdx) + 1);
    labelCell.value = 'TOTALES';
    labelCell.alignment = { horizontal: labelIdx <= 0 ? 'left' : 'right' };
    columns.forEach((c, i) => {
      if (!c.total) return;
      const cell = totalsRow.getCell(i + 1);
      cell.value = round2g(totals[i]);
      cell.numFmt = c.numFmt ?? '#,##0.00';
      cell.alignment = { horizontal: c.align ?? 'right' };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`,
  );
}

/** Fecha-solo → Date para celdas (reexport para páginas). */
export function excelDateCell(iso: string | null | undefined): Date | null {
  return dateCell(iso);
}

// ===========================================================================
// CUENTAS POR COBRAR — "RELACION DE INGRESOS" (lista plana)
// ===========================================================================

/** Monto $, tasa y Bs derivados de una fila (según modo USD o tasa fija). */
function receivableAmounts(
  r: ReportReceivableRow,
  currentRateBs: number | null,
): { usd: number; rate: number | null; bs: number | null } {
  if (r.useFixedRate) {
    const rate = r.rateBs && r.rateBs > 0 ? r.rateBs : null;
    const bs = r.targetBs ?? null;
    const usd = bs != null && rate ? bs / rate : (r.targetUsd ?? 0);
    return { usd, rate, bs };
  }
  const usd = r.targetUsd ?? 0;
  const rate = currentRateBs && currentRateBs > 0 ? currentRateBs : null;
  const bs = rate != null ? usd * rate : null;
  return { usd, rate, bs };
}

export async function downloadReceivablesReportXlsx(
  rows: ReportReceivableRow[],
  currentRateBs: number | null,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  const ws = wb.addWorksheet('CUENTAS POR COBRAR', { views: [{ showGridLines: true }] });

  const widths = [12, 22, 22, 13, 22, 13, 18, 12, 11, 11, 12, 13, 11, 14, 11];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('D2:J2');
  const title = ws.getCell('D2');
  title.value = 'RELACION DE INGRESOS (CUENTAS POR COBRAR)';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B4');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  const HEADERS = [
    'FECHA',
    'CLIENTE',
    'TITULAR',
    'RIF TITULAR',
    'PACIENTE',
    'RIF PACIENTE',
    'MEDICO TRATANTE',
    'N° CLAVE',
    'N° FACTURA',
    'N° CONTROL',
    'N° ORDEN INTERNA',
    'MONTO FACTURADO $',
    'TASA DEL DIA',
    'MONTO BS',
    'COSTO',
  ];
  const headerRow = ws.getRow(6);
  headerRow.height = 42;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  let rowNum = 7;
  let totalUsd = 0;
  let totalBs = 0;
  let totalCosto = 0;
  // El costo (Σ providerAmountUsd) viene POR ORDEN: una orden mixta emite 2
  // filas (porción fija + indexada) con el mismo costo — contarlo una sola vez.
  const costoSeen = new Set<string>();
  for (const r of rows) {
    const { usd, rate, bs } = receivableAmounts(r, currentRateBs);
    totalUsd += usd;
    totalBs += bs ?? 0;
    const firstPortionOfOrder = !costoSeen.has(r.orderId);
    if (firstPortionOfOrder) {
      costoSeen.add(r.orderId);
      totalCosto += r.costoUsd ?? 0;
    }
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [1, dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [2, r.debtorName, { horizontal: 'left' }],
      [3, r.holderName, { horizontal: 'left' }],
      [4, r.holderId, { horizontal: 'left' }],
      [5, r.patientName, { horizontal: 'left' }],
      [6, r.patientId, { horizontal: 'left' }],
      [7, r.doctorName, { horizontal: 'left' }],
      [8, r.serviceKey, { horizontal: 'center' }, '@'],
      [9, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [10, r.controlNumber, { horizontal: 'center' }, '@'],
      [11, r.orderNumber, { horizontal: 'center' }, '@'],
      [12, usd, { horizontal: 'center' }, '0.00'],
      [13, rate ?? '', { horizontal: 'center' }, '0.00'],
      [14, bs ?? '', { horizontal: 'center' }, '#,##0.00'],
      [15, firstPortionOfOrder ? r.costoUsd ?? 0 : '', { horizontal: 'center' }, '#,##0.00'],
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F8;
      if (alignment) cell.alignment = alignment;
      if (numFmt) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  }

  // Fila de totales.
  const totalsRow = ws.getRow(rowNum);
  for (let col = 1; col <= 15; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thin();
  }
  const label = totalsRow.getCell(11);
  label.value = 'TOTALES';
  label.alignment = { horizontal: 'right' };
  const setTotal = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = val;
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  setTotal(12, Math.round(totalUsd * 100) / 100, '0.00');
  setTotal(14, Math.round(totalBs * 100) / 100, '#,##0.00');
  setTotal(15, Math.round(totalCosto * 100) / 100, '#,##0.00');

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Cuentas-por-cobrar.xlsx',
  );
}

// ===========================================================================
// CUENTAS POR PAGAR — "EDO. DE CUENTA" (lista plana + hoja por proveedor)
// ===========================================================================

const round2 = (n: number): number => Math.round(n * 100) / 100;

function providerKey(r: ReportPayableRow): string {
  return `${r.providerType}:${r.providerId ?? r.providerName}`;
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  mobile_payment: 'PAGO MÓVIL',
  bank_transfer: 'TRANSFERENCIA',
  cash_usd: 'EFECTIVO $',
  cash_eur: 'EFECTIVO €',
  cash_bs: 'EFECTIVO Bs',
  other: 'OTRO',
};

/**
 * Abreviatura del banco: la de los paréntesis del catálogo ("Banco Nacional de
 * Crédito (BNC)" → "BNC") o el nombre sin el prefijo "Banco …". Sin banco
 * (efectivo), el tipo de pago.
 */
function bankAbbrev(p: ReportPayablePayment): string {
  const name = p.bankName?.trim();
  if (name) {
    const paren = /\(([^)]+)\)/.exec(name);
    if (paren) return paren[1].trim();
    return name.replace(/^banco\s+(de\s+los\s+|de\s+la\s+|del\s+|de\s+)?/i, '').trim() || name;
  }
  return p.bankCode?.trim() || PAYMENT_TYPE_LABEL[p.type] || '';
}

/** Un pago → "BNC, REF 5061, (Bs. 17.451,00)". */
function formatPaymentRef(p: ReportPayablePayment): string {
  const parts: string[] = [];
  const bank = bankAbbrev(p);
  if (bank) parts.push(bank);
  if (p.reference) parts.push(`REF ${p.reference}`);
  parts.push(`(${formatBs(p.amountBs)})`);
  return parts.join(', ');
}

/** Columnas de las hojas de cuentas por pagar. `facturacion` es opcional. */
type PayableCol =
  | 'fecha'
  | 'proveedor'
  | 'paciente'
  | 'orden'
  | 'seguros'
  | 'procedimiento'
  | 'facturacion'
  | 'porPagar'
  | 'pagadas'
  | 'montoPagado'
  | 'fechaPago'
  | 'refPago'
  | 'estado';

interface PayableColDef {
  key: PayableCol;
  header: string;
  width: number;
}

type CellSpec = [ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?];

/** Quita FACTURACION $ cuando el Excel se descarga sin esa columna. */
function payableCols(defs: PayableColDef[], includeFacturacion: boolean): PayableColDef[] {
  return includeFacturacion ? defs : defs.filter((c) => c.key !== 'facturacion');
}

/** Hoja "EDO. DE CUENTA" de UN proveedor (formato de la plantilla). */
async function buildProviderSheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  sheetName: string,
  providerName: string,
  rows: ReportPayableRow[],
  includeFacturacion: boolean,
): Promise<void> {
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  const COLS = payableCols(
    [
      { key: 'fecha', header: 'FECHA', width: 12 },
      { key: 'paciente', header: 'NOMBRE DEL PACIENTE', width: 22 },
      { key: 'orden', header: 'Nº ORDEN', width: 9 },
      { key: 'seguros', header: 'SEGUROS', width: 16 },
      { key: 'procedimiento', header: 'PROCEDIMIENTO', width: 20 },
      { key: 'facturacion', header: 'FACTURACION $', width: 13 },
      { key: 'porPagar', header: 'ORDENES POR PAGAR $', width: 14 },
      { key: 'pagadas', header: 'ORDENES PAGADAS $', width: 13 },
      { key: 'montoPagado', header: 'MONTO PAGADO $', width: 12 },
      { key: 'fechaPago', header: 'FECHA DE PAGO', width: 12 },
      { key: 'refPago', header: 'REF DEL PAGO', width: 30 },
    ],
    includeFacturacion,
  );
  // La tabla arranca en la columna B: la A es el margen de la plantilla.
  const FIRST = 2;
  const colOf = (key: PayableCol): number => COLS.findIndex((c) => c.key === key) + FIRST;
  const lastCol = COLS.length + FIRST - 1;
  const lastLetter = colLetter(lastCol);

  ws.getColumn(1).width = 4;
  COLS.forEach((c, i) => {
    ws.getColumn(i + FIRST).width = c.width;
  });

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells(`E2:${lastLetter}2`);
  const name = ws.getCell('E2');
  name.value = providerName.toUpperCase();
  name.font = F12B;
  name.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B3');
  rif.value = COMPANY.rif;
  rif.font = F11B;
  ws.mergeCells(`E3:${lastLetter}3`);
  const sub = ws.getCell('E3');
  sub.value = 'EDO. DE CUENTA';
  sub.font = F11B;
  sub.alignment = { horizontal: 'center' };

  const headerRow = ws.getRow(5);
  headerRow.height = 30;
  COLS.forEach((c, i) => {
    const cell = headerRow.getCell(i + FIRST);
    cell.value = c.header;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  // Índice del último renglón de cada lote PAGADO → ahí van MONTO PAGADO/FECHA/REF.
  const lastPaidIdx = new Map<string, number>();
  const paidSumByBatch = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.state === 'paid' && r.payableNumber) {
      lastPaidIdx.set(r.payableNumber, i);
      paidSumByBatch.set(
        r.payableNumber,
        (paidSumByBatch.get(r.payableNumber) ?? 0) + (r.grossUsd ?? 0),
      );
    }
  });

  let rowNum = 6;
  let totFact = 0;
  let totPorPagar = 0;
  let totPagadas = 0;
  rows.forEach((r, i) => {
    const paid = r.state === 'paid';
    const porPagar = paid ? null : (r.grossUsd ?? 0);
    const pagadas = paid ? (r.grossUsd ?? 0) : null;
    totFact += r.facturacionUsd ?? 0;
    totPorPagar += porPagar ?? 0;
    totPagadas += pagadas ?? 0;
    const isLastPaid = paid && r.payableNumber && lastPaidIdx.get(r.payableNumber) === i;
    const montoPagado = isLastPaid ? (paidSumByBatch.get(r.payableNumber!) ?? 0) : '';
    const fechaPago = isLastPaid ? dateCell(r.paymentDate) : '';
    // Ref. del pago: un renglón por pago — banco, referencia y monto en Bs.
    const pagos = isLastPaid ? (r.payments ?? []) : [];
    const refPago =
      pagos.length > 0
        ? pagos.map(formatPaymentRef).join('\n')
        : isLastPaid
          ? (r.paymentReference ?? '')
          : '';

    const cells: Partial<Record<PayableCol, CellSpec>> = {
      fecha: [dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      paciente: [r.patientName, { horizontal: 'left' }],
      orden: [r.internalNumber, { horizontal: 'center' }, '@'],
      seguros: [r.insuranceName ?? 'PARTICULAR', { horizontal: 'center' }],
      procedimiento: [r.procedure ?? '', { horizontal: 'center' }],
      facturacion: [r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      porPagar: [porPagar ?? '', { horizontal: 'center' }, '0.00'],
      pagadas: [pagadas ?? '', { horizontal: 'center' }, '0.00'],
      montoPagado: [montoPagado, { horizontal: 'center' }, '0.00'],
      fechaPago: [fechaPago, { horizontal: 'center' }, 'dd/mm/yyyy'],
      refPago: [refPago, { horizontal: 'center', vertical: 'middle', wrapText: true }],
    };
    const row = ws.getRow(rowNum);
    COLS.forEach((c, idx) => {
      const [value, alignment, numFmt] = cells[c.key] ?? [''];
      const cell = row.getCell(idx + FIRST);
      cell.value = value;
      cell.font = F9;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    });
    rowNum += 1;
  });

  // Totales.
  const totalsRow = ws.getRow(rowNum);
  for (let col = FIRST; col <= lastCol; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(colOf('procedimiento'));
  tLabel.value = 'TOTALES';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  const put = (col: number, val: number) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.font = F9B;
    c.numFmt = '0.00';
    c.alignment = { horizontal: 'center' };
  };
  if (includeFacturacion) put(colOf('facturacion'), totFact);
  put(colOf('porPagar'), totPorPagar);
  put(colOf('pagadas'), totPagadas);
}

/** Hoja plana con TODAS las obligaciones (primera hoja cuando hay >1 proveedor). */
function buildFlatSheet(
  wb: ExcelJS.Workbook,
  rows: ReportPayableRow[],
  includeFacturacion: boolean,
): void {
  const ws = wb.addWorksheet('LISTA GENERAL', { views: [{ showGridLines: true }] });
  const COLS = payableCols(
    [
      { key: 'fecha', header: 'FECHA', width: 12 },
      { key: 'proveedor', header: 'PROVEEDOR', width: 24 },
      { key: 'paciente', header: 'NOMBRE DEL PACIENTE', width: 22 },
      { key: 'orden', header: 'Nº ORDEN', width: 9 },
      { key: 'seguros', header: 'SEGUROS', width: 16 },
      { key: 'procedimiento', header: 'PROCEDIMIENTO', width: 20 },
      { key: 'facturacion', header: 'FACTURACION $', width: 13 },
      { key: 'porPagar', header: 'ORDENES POR PAGAR $', width: 14 },
      { key: 'pagadas', header: 'ORDENES PAGADAS $', width: 13 },
      { key: 'estado', header: 'ESTADO', width: 14 },
    ],
    includeFacturacion,
  );
  const FIRST = 1;
  const colOf = (key: PayableCol): number => COLS.findIndex((c) => c.key === key) + FIRST;
  const lastCol = COLS.length;
  COLS.forEach((c, i) => {
    ws.getColumn(i + FIRST).width = c.width;
  });

  const title = ws.getCell('A1');
  title.value = `RELACION DE CUENTAS POR PAGAR — RIF ${COMPANY.rif}`;
  title.font = F_RIF;

  const headerRow = ws.getRow(3);
  headerRow.height = 30;
  COLS.forEach((c, i) => {
    const cell = headerRow.getCell(i + FIRST);
    cell.value = c.header;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  const STATE: Record<string, string> = {
    sin_lote: 'Por pagar',
    unpaid: 'Por pagar',
    partially_paid: 'Pago parcial',
    paid: 'Pagado',
  };

  let rowNum = 4;
  let totFact = 0;
  let totPorPagar = 0;
  let totPagadas = 0;
  for (const r of rows) {
    const paid = r.state === 'paid';
    const porPagar = paid ? null : (r.grossUsd ?? 0);
    const pagadas = paid ? (r.grossUsd ?? 0) : null;
    totFact += r.facturacionUsd ?? 0;
    totPorPagar += porPagar ?? 0;
    totPagadas += pagadas ?? 0;
    const cells: Partial<Record<PayableCol, CellSpec>> = {
      fecha: [dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      proveedor: [r.providerName, { horizontal: 'left' }],
      paciente: [r.patientName, { horizontal: 'left' }],
      orden: [r.internalNumber, { horizontal: 'center' }, '@'],
      seguros: [r.insuranceName ?? 'PARTICULAR', { horizontal: 'center' }],
      procedimiento: [r.procedure ?? '', { horizontal: 'left' }],
      facturacion: [r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      porPagar: [porPagar ?? '', { horizontal: 'center' }, '0.00'],
      pagadas: [pagadas ?? '', { horizontal: 'center' }, '0.00'],
      estado: [STATE[r.state] ?? r.state, { horizontal: 'center' }],
    };
    const row = ws.getRow(rowNum);
    COLS.forEach((c, idx) => {
      const [value, alignment, numFmt] = cells[c.key] ?? [''];
      const cell = row.getCell(idx + FIRST);
      cell.value = value;
      cell.font = F9;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    });
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  for (let col = FIRST; col <= lastCol; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(colOf('procedimiento'));
  tLabel.value = 'TOTALES';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  const put = (col: number, val: number) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.font = F9B;
    c.numFmt = '0.00';
    c.alignment = { horizontal: 'center' };
  };
  if (includeFacturacion) put(colOf('facturacion'), totFact);
  put(colOf('porPagar'), totPorPagar);
  put(colOf('pagadas'), totPagadas);
}

/** Nombre de hoja seguro (≤31 chars, sin caracteres inválidos, único). */
function sheetName(base: string, used: Set<string>): string {
  const clean = base.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Proveedor';
  let name = clean;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    name = `${clean.slice(0, 25)} ${i}`;
    i += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function downloadPayablesReportXlsx(
  rows: ReportPayableRow[],
  options: { includeFacturacion?: boolean } = {},
): Promise<void> {
  const includeFacturacion = options.includeFacturacion ?? false;
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;

  const logoBuf = await loadLogoBuffer();
  const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null;

  // Agrupa por proveedor conservando el orden de aparición.
  const groups = new Map<string, { name: string; rows: ReportPayableRow[] }>();
  for (const r of rows) {
    const key = providerKey(r);
    let g = groups.get(key);
    if (!g) {
      g = { name: r.providerName, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(r);
  }

  const used = new Set<string>();
  if (groups.size > 1) {
    // Primera hoja: lista plana única; luego una hoja por proveedor.
    used.add('lista general');
    buildFlatSheet(wb, rows, includeFacturacion);
    for (const g of groups.values()) {
      await buildProviderSheet(
        wb,
        logoId,
        sheetName(g.name, used),
        g.name,
        g.rows,
        includeFacturacion,
      );
    }
  } else {
    // Un solo proveedor: sólo su hoja.
    const g = groups.values().next().value as { name: string; rows: ReportPayableRow[] } | undefined;
    if (g)
      await buildProviderSheet(
        wb,
        logoId,
        sheetName(g.name, used),
        g.name,
        g.rows,
        includeFacturacion,
      );
    else buildFlatSheet(wb, rows, includeFacturacion);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const suffix = groups.size === 1 ? safeFilenameSegment(rows[0]?.providerName ?? 'proveedor') : 'general';
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Cuentas-por-pagar-${suffix}.xlsx`,
  );
}

// ===========================================================================
// RELACION DE INGRESOS — detalle por factura + hoja resumen
// Espeja la planilla que lleva administración: hoja 1 con los datos completos
// de cada factura y hoja 2 con el resumen (fecha, cliente, N° factura, montos).
// ===========================================================================

/** Rótulo del período para el subtítulo ("DEL dd/mm/yyyy AL dd/mm/yyyy"). */
export function excelPeriodLabel(from?: string, to?: string): string {
  const fmt = (iso: string): string => {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };
  if (from && to) return `DEL ${fmt(from)} AL ${fmt(to)}`;
  if (from) return `DESDE ${fmt(from)}`;
  if (to) return `HASTA ${fmt(to)}`;
  return 'TODAS LAS FECHAS';
}

const INCOME_HEADERS = [
  'FECHA',
  'CLIENTE',
  'TITULAR',
  'RIF TITULAR',
  'PACIENTE',
  'RIF PACIENTE',
  'MEDICO TRATANTE',
  'N° REMESA',
  'N° CLAVE',
  'N° FACTURA',
  'N° CONTROL',
  'N° ORDEN INTERNA',
  'MONTO FACTURADO $',
  'TASA DEL DIA',
  'MONTO FACTURADO Bs',
  'COSTO',
];

/** Hoja 1: detalle completo, una fila por factura. */
function buildIncomeDetailSheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  rows: ReportInvoiceRow[],
  period: string,
): void {
  const ws = wb.addWorksheet('RELACION DE INGRESOS', {
    views: [{ showGridLines: true }],
  });
  const widths = [12, 24, 24, 14, 24, 14, 20, 11, 15, 12, 12, 14, 15, 11, 16, 10];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('B2:P2');
  const title = ws.getCell('B2');
  title.value = 'RELACION DE INGRESOS';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells('B3:P3');
  const sub = ws.getCell('B3');
  sub.value = period;
  sub.font = F9B;
  sub.alignment = { horizontal: 'center' };

  const rif = ws.getCell('A4');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  const headerRow = ws.getRow(6);
  headerRow.height = 42;
  INCOME_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  let rowNum = 7;
  let totalUsd = 0;
  let totalBs = 0;
  let totalCosto = 0;
  for (const r of rows) {
    const cancelled = r.status === 'cancelled';
    totalUsd += cancelled ? 0 : r.amountUsd;
    totalBs += cancelled ? 0 : (r.amountBs ?? 0);
    totalCosto += cancelled ? 0 : r.costUsd;
    // Las anuladas conservan su renglón (el correlativo no se salta) pero sin
    // montos: es como se lleva el libro en papel.
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [1, dateCell(r.invoiceDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [2, cancelled ? 'ANULADO' : r.clientName, { horizontal: 'left' }],
      [3, cancelled ? 'ANULADA' : r.holderName, { horizontal: 'left' }],
      [4, cancelled ? '' : r.holderId, { horizontal: 'left' }],
      [5, cancelled ? '' : r.patientName, { horizontal: 'left' }],
      [6, cancelled ? '' : r.patientId, { horizontal: 'left' }],
      [7, cancelled ? '' : r.doctorName, { horizontal: 'left' }],
      [8, '', { horizontal: 'center' }, '@'],
      [9, cancelled ? '' : r.serviceKey, { horizontal: 'center' }, '@'],
      [10, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [11, r.controlNumber, { horizontal: 'center' }, '@'],
      [12, cancelled ? '' : r.internalNumbers || r.orderNumbers, { horizontal: 'center' }, '@'],
      [13, cancelled ? '' : r.amountUsd, { horizontal: 'center' }, '0.00'],
      [14, cancelled ? '' : (r.rateBs ?? ''), { horizontal: 'center' }, '0.00'],
      [15, cancelled ? '' : (r.amountBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
      [16, cancelled ? '' : r.costUsd, { horizontal: 'center' }, '#,##0.00'],
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F8;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  for (let col = 1; col <= 16; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thin();
  }
  const label = totalsRow.getCell(12);
  label.value = 'TOTALES';
  label.alignment = { horizontal: 'right' };
  const put = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  put(13, totalUsd, '0.00');
  put(15, totalBs, '#,##0.00');
  put(16, totalCosto, '#,##0.00');
}

/** Hoja 2: resumen (fecha, cliente, N° factura y montos), col. C a H. */
function buildIncomeSummarySheet(
  wb: ExcelJS.Workbook,
  rows: ReportInvoiceRow[],
  period: string,
): void {
  const ws = wb.addWorksheet('RESUMEN', { views: [{ showGridLines: true }] });
  const widths = [9, 9, 12, 30, 14, 14, 13, 18];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.mergeCells('C1:H1');
  const title = ws.getCell('C1');
  title.value = 'RESUMEN DE RELACION DE INGRESOS';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells('C2:H2');
  const sub = ws.getCell('C2');
  sub.value = period;
  sub.font = F9B;
  sub.alignment = { horizontal: 'center' };

  const HEADERS = [
    'FECHA',
    'CLIENTE',
    'N° FACTURA',
    'MONTO FACTURADO $',
    'TASA DEL DIA',
    'MONTO FACTURADO Bs',
  ];
  const headerRow = ws.getRow(3);
  headerRow.height = 30;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 3); // desde col C
    cell.value = h;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });

  let rowNum = 4;
  let totalUsd = 0;
  let totalBs = 0;
  for (const r of rows) {
    const cancelled = r.status === 'cancelled';
    totalUsd += cancelled ? 0 : r.amountUsd;
    totalBs += cancelled ? 0 : (r.amountBs ?? 0);
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [3, dateCell(r.invoiceDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [4, cancelled ? 'ANULADO' : r.clientName, { horizontal: 'left' }],
      [5, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [6, cancelled ? '' : r.amountUsd, { horizontal: 'center' }, '0.00'],
      [7, cancelled ? '' : (r.rateBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
      [8, cancelled ? '' : (r.amountBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F8;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  for (let col = 3; col <= 8; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thin();
  }
  const label = totalsRow.getCell(5);
  label.value = 'TOTALES';
  label.alignment = { horizontal: 'right' };
  const put = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  put(6, totalUsd, '0.00');
  put(8, totalBs, '#,##0.00');
}

/**
 * Excel de "Relación de ingresos": hoja de detalle + hoja de resumen, con las
 * facturas ya ordenadas cronológicamente por el backend.
 */
export async function downloadIncomeRelationXlsx(
  rows: ReportInvoiceRow[],
  opts: { from?: string; to?: string } = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  const period = excelPeriodLabel(opts.from, opts.to);

  const logoBuf = await loadLogoBuffer();
  const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null;

  buildIncomeDetailSheet(wb, logoId, rows, period);
  buildIncomeSummarySheet(wb, rows, period);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Relacion-de-ingresos.xlsx',
  );
}
