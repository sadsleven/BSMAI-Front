import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeFilenameSegment } from '@/modules/orders/presentation/components/orderExcel';
import type {
  ReportInvoiceRow,
  ReportPayablePayment,
  ReportPayableRow,
  ReportPayableSettlement,
  ReportReceivableRow,
} from '../../infrastructure/reportsGateway';
import { formatBs } from '../../domain/format';
import {
  MONTHLY_STATEMENT_LABEL,
  isMonthlyStatementProvider,
} from '../../domain/monthlyStatement';
import { pendingUsdOf } from '../../domain/payablesSummary';
import {
  receivableAmounts,
  receivablesSummaryByDebtor,
} from '../../domain/receivablesSummary';

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

/**
 * Inmoviliza la cabecera: al bajar por la hoja, las filas de título y el
 * encabezado quedan fijos. `headerRow` es la última fila que se congela.
 */
function freezeAt(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  showGridLines = true,
): void {
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines }];
}

/**
 * Fecha de la fila en los listados: la de la FACTURA cuando existe y, si la
 * orden aún no se facturó, la de la orden. Pedido del cliente (28/10/2026):
 * relación de ingresos, cuentas por pagar y por cobrar van por fecha de factura.
 */
function rowDate(r: {
  invoiceDate?: string | null;
  orderDate?: string | null;
}): string | null {
  return r.invoiceDate || r.orderDate || null;
}

/** Fecha de factura (con fallback a la de la orden) para las páginas. */
export function reportRowDate(r: {
  invoiceDate?: string | null;
  orderDate?: string | null;
}): string | null {
  return rowDate(r);
}

/**
 * Nombre que se imprime en la columna SEGUROS cuando la orden no tiene seguro
 * (particular / contado). El cliente lo pidió como "AFMI" (28/10/2026).
 */
const NO_INSURANCE_LABEL = 'AFMI';

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
  freezeAt(ws, 6);

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

/**
 * Monto $, tasa y Bs de una fila. Vive en el dominio para que la pantalla y
 * el Excel muestren exactamente lo mismo; se reexporta por comodidad.
 */
export { receivableAmounts } from '../../domain/receivablesSummary';

/** Rótulo del estado de cobro en el Excel. */
const RECEIVABLE_STATE_LABEL: Record<string, string> = {
  sin_lote: 'Por cobrar',
  uncollected: 'Por cobrar',
  partially_collected: 'Cobro parcial',
  collected: 'Cobrada',
  overcollected: 'Sobre-cobrada',
};

/** Fecha de emisión que va arriba a la derecha de cada hoja. */
function todayCell(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
}

/**
 * Hoja "CUENTAS POR COBRAR": cuánto debe cada seguro / titular, de mayor a
 * menor. Es la primera hoja del libro — el cuadro resumen que revisa
 * administración antes de entrar al detalle de cada deudor.
 */
function buildReceivablesSummarySheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  debtors: Array<{ name: string; usd: number; updatedUsd: number }>,
  currentRateBs: number | null,
): void {
  const ws = wb.addWorksheet('CUENTAS POR COBRAR', {
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 24;

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('C2:D2');
  const title = ws.getCell('C2');
  title.value = 'CUENTAS POR COBRAR';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  const sub = ws.getCell('C3');
  sub.value = 'RESUMEN';
  sub.font = F9B;
  sub.alignment = { horizontal: 'center' };

  const emitted = ws.getCell('E2');
  emitted.value = todayCell();
  emitted.numFmt = 'dd/mm/yyyy';
  emitted.font = F9;
  emitted.alignment = { horizontal: 'right' };

  const rif = ws.getCell('B3');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  const rateLabel = currentRateBs
    ? `MONTO ACTUALIZADO (Tasa: ${formatNumber2(currentRateBs)})`
    : 'MONTO ACTUALIZADO $';
  const headerRow = ws.getRow(5);
  headerRow.height = 30;
  ['SEGURO', 'MONTO FACTURADO $', rateLabel].forEach((h, i) => {
    const cell = headerRow.getCell(i + 2);
    cell.value = h;
    cell.font = { ...F9B, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC00000' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });
  freezeAt(ws, 5, false);

  let rowNum = 6;
  let totalUsd = 0;
  let totalUpdated = 0;
  for (const d of debtors) {
    totalUsd += d.usd;
    totalUpdated += d.updatedUsd;
    const row = ws.getRow(rowNum);
    const name = row.getCell(2);
    name.value = d.name.toUpperCase();
    name.font = F9;
    name.alignment = { horizontal: 'center' };
    name.border = thin();
    const put = (col: number, val: number) => {
      const c = row.getCell(col);
      c.value = round2(val);
      c.font = F9;
      c.numFmt = '#,##0.00';
      c.alignment = { horizontal: 'center' };
      c.border = thin();
    };
    put(3, d.usd);
    put(4, d.updatedUsd);
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  const tLabel = totalsRow.getCell(2);
  tLabel.value = 'TOTAL';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'center' };
  tLabel.border = thin();
  const putTotal = (col: number, val: number) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.font = F9B;
    c.numFmt = '#,##0.00';
    c.alignment = { horizontal: 'center' };
    c.border = thin();
  };
  putTotal(3, totalUsd);
  putTotal(4, totalUpdated);
}

/** Número con 2 decimales y separador de miles, estilo es-VE. */
function formatNumber2(n: number): string {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Hoja "EDO. DE CUENTA" de UN deudor: las órdenes que tiene pendientes (o
 * todas, si el usuario pidió incluir las cobradas).
 */
function buildReceivableDebtorSheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  name: string,
  rows: ReportReceivableRow[],
  currentRateBs: number | null,
  includeState: boolean,
): void {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
  const HEADERS = [
    'FECHA',
    'CLIENTE',
    'N° CLAVE',
    'N° FACTURA',
    'N° CONTROL',
    'N°ORDEN DE SERVICIO',
    'MONTO FACTURADO $',
    'TASA DEL DIA',
    'MONTO FACTURADO Bs',
    ...(includeState ? ['ESTADO'] : []),
  ];
  const WIDTHS = [4, 12, 26, 12, 11, 11, 13, 13, 11, 16, 14];
  WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const FIRST = 2;
  const lastCol = HEADERS.length + FIRST - 1;
  const lastLetter = colLetter(lastCol);

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells(`D2:${lastLetter}2`);
  const title = ws.getCell('D2');
  title.value = name.toUpperCase();
  title.font = F12B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells(`D3:${lastLetter}3`);
  const sub = ws.getCell('D3');
  sub.value = 'EDO. DE CUENTA';
  sub.font = F11B;
  sub.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B3');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  const headerRow = ws.getRow(5);
  headerRow.height = 42;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + FIRST);
    cell.value = h;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });
  freezeAt(ws, 5, false);

  let rowNum = 6;
  let totalUsd = 0;
  let totalBs = 0;
  for (const r of rows) {
    const { usd, rate, bs } = receivableAmounts(r, currentRateBs);
    totalUsd += usd;
    totalBs += bs ?? 0;
    const values: Array<[number, ExcelJS.CellValue, string?]> = [
      [FIRST, dateCell(rowDate(r)), 'dd/mm/yyyy'],
      [FIRST + 1, r.debtorName],
      [FIRST + 2, r.serviceKey, '@'],
      [FIRST + 3, r.invoiceNumber, '@'],
      [FIRST + 4, r.controlNumber, '@'],
      [FIRST + 5, r.orderNumber, '@'],
      [FIRST + 6, usd, '0.00'],
      [FIRST + 7, rate ?? '', '0.00'],
      [FIRST + 8, bs ?? '', '#,##0.00'],
      ...(includeState
        ? ([[FIRST + 9, RECEIVABLE_STATE_LABEL[r.state] ?? r.state]] as Array<
            [number, ExcelJS.CellValue, string?]
          >)
        : []),
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F9;
      cell.alignment = { horizontal: 'center' };
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  for (let col = FIRST; col <= lastCol; col += 1)
    totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(FIRST + 5);
  tLabel.value = 'TOTAL';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  const put = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.font = F9B;
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  put(FIRST + 6, totalUsd, '0.00');
  put(FIRST + 8, totalBs, '#,##0.00');
}

/**
 * Excel de cuentas por cobrar con el mismo modelo que el de cuentas por pagar:
 * hoja 1 con el resumen por deudor y una hoja por deudor con sus órdenes.
 * `includeCollected` sólo agrega la columna ESTADO — el filtrado de pendientes
 * lo hace el backend, así que las filas llegan ya acotadas.
 */
export async function downloadReceivablesReportXlsx(
  rows: ReportReceivableRow[],
  currentRateBs: number | null,
  options: { includeCollected?: boolean } = {},
): Promise<void> {
  const includeState = options.includeCollected ?? false;
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;

  const logoBuf = await loadLogoBuffer();
  const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null;

  // Agrupa por deudor conservando el orden de aparición.
  const groups = new Map<string, { name: string; rows: ReportReceivableRow[] }>();
  for (const r of rows) {
    const key = `${r.debtorType}:${r.debtorId ?? r.debtorName}`;
    let g = groups.get(key);
    if (!g) {
      g = { name: r.debtorName, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(r);
  }

  // Mismo cuadro que la pestaña Resumen en pantalla (una sola fuente).
  const debtors = receivablesSummaryByDebtor(rows, currentRateBs);

  buildReceivablesSummarySheet(wb, logoId, debtors, currentRateBs);

  const used = new Set<string>(['cuentas por cobrar']);
  for (const g of groups.values()) {
    buildReceivableDebtorSheet(
      wb,
      logoId,
      sheetName(g.name, used),
      g.rows,
      currentRateBs,
      includeState,
    );
  }

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
export function formatPayablePaymentRef(p: ReportPayablePayment): string {
  return formatPaymentRef(p);
}

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
  | 'abonado'
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

  freezeAt(ws, 5, false);

  // Último renglón de CADA lote: ahí abajo se imprimen sus abonos, uno por
  // renglón, de modo que los pagos parciales queden a la vista (antes sólo
  // se mostraba el pago de los lotes ya saldados).
  //
  // Los abonos son del LOTE y el backend los repite en cada una de sus
  // órdenes: se juntan de TODAS las filas y se deduplican por id, para no
  // depender de cuál renglón los traiga ni imprimirlos por duplicado.
  const lastIdxByBatch = new Map<string, number>();
  const settlementsByBatch = new Map<string, ReportPayableSettlement[]>();
  rows.forEach((r, i) => {
    if (!r.payableId) return;
    lastIdxByBatch.set(r.payableId, i);
    let list = settlementsByBatch.get(r.payableId);
    if (!list) {
      list = [];
      settlementsByBatch.set(r.payableId, list);
    }
    for (const st of r.settlements ?? []) {
      if (!list.some((x) => x.id === st.id)) list.push(st);
    }
  });

  let rowNum = 6;
  let totFact = 0;
  let totPorPagar = 0;
  let totPagadas = 0;
  let totAbonado = 0;

  /** Escribe un renglón de la hoja con el mapa de celdas por columna. */
  const writeRow = (cells: Partial<Record<PayableCol, CellSpec>>): void => {
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
  };

  rows.forEach((r, i) => {
    const paid = r.state === 'paid';
    const porPagar = paid ? null : (r.grossUsd ?? 0);
    const pagadas = paid ? (r.grossUsd ?? 0) : null;
    totFact += r.facturacionUsd ?? 0;
    totPorPagar += porPagar ?? 0;
    totPagadas += pagadas ?? 0;

    writeRow({
      fecha: [dateCell(rowDate(r)), { horizontal: 'center' }, 'dd/mm/yyyy'],
      paciente: [r.patientName, { horizontal: 'left' }],
      orden: [r.internalNumber, { horizontal: 'center' }, '@'],
      seguros: [r.insuranceName ?? NO_INSURANCE_LABEL, { horizontal: 'center' }],
      procedimiento: [r.procedure ?? '', { horizontal: 'center' }],
      facturacion: [r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      porPagar: [porPagar ?? '', { horizontal: 'center' }, '0.00'],
      pagadas: [pagadas ?? '', { horizontal: 'center' }, '0.00'],
    });

    // Abonos del lote, después de su último renglón.
    if (!r.payableId || lastIdxByBatch.get(r.payableId) !== i) return;
    for (const st of settlementsByBatch.get(r.payableId) ?? []) {
      totAbonado += st.coveredUsd;
      const refs = st.payments.map(formatPaymentRef);
      writeRow({
        fecha: [dateCell(st.settlementDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
        procedimiento: [
          `ABONO LOTE ${r.payableNumber ?? ''}`.trim(),
          { horizontal: 'center' },
        ],
        montoPagado: [st.coveredUsd, { horizontal: 'center' }, '0.00'],
        fechaPago: [
          dateCell(st.settlementDate),
          { horizontal: 'center' },
          'dd/mm/yyyy',
        ],
        refPago: [
          refs.length > 0 ? refs.join('\n') : (r.paymentReference ?? ''),
          { horizontal: 'center', vertical: 'middle', wrapText: true },
        ],
      });
    }
  });

  // Totales.
  const totalsRow = ws.getRow(rowNum);
  for (let col = FIRST; col <= lastCol; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(colOf('procedimiento'));
  tLabel.value = 'TOTALES';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  const put = (row: ExcelJS.Row, col: number, val: number) => {
    const c = row.getCell(col);
    c.value = round2(val);
    c.font = F9B;
    c.numFmt = '0.00';
    c.alignment = { horizontal: 'center' };
  };
  if (includeFacturacion) put(totalsRow, colOf('facturacion'), totFact);
  put(totalsRow, colOf('porPagar'), totPorPagar);
  put(totalsRow, colOf('pagadas'), totPagadas);
  put(totalsRow, colOf('montoPagado'), totAbonado);

  // Saldo real: lo que falta por pagar descontando lo ya abonado de los lotes
  // con pago parcial (las órdenes de esos lotes siguen listadas por su bruto).
  rowNum += 1;
  const saldoRow = ws.getRow(rowNum);
  for (let col = FIRST; col <= lastCol; col += 1) saldoRow.getCell(col).border = thin();
  const sLabel = saldoRow.getCell(colOf('procedimiento'));
  sLabel.value = 'SALDO PENDIENTE';
  sLabel.font = F9B;
  sLabel.alignment = { horizontal: 'right' };
  put(saldoRow, colOf('porPagar'), Math.max(0, totPorPagar - totAbonado));
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
      { key: 'abonado', header: 'ABONADO $', width: 12 },
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
  freezeAt(ws, 3);

  const STATE: Record<string, string> = {
    sin_lote: 'Por pagar',
    unpaid: 'Por pagar',
    partially_paid: 'Pago parcial',
    paid: 'Pagado',
  };

  // Lo abonado es del LOTE, no del renglón: se imprime una sola vez, en la
  // última orden de cada lote, para no contarlo tantas veces como órdenes tenga.
  const lastIdxByBatch = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.payableId) lastIdxByBatch.set(r.payableId, i);
  });

  let rowNum = 4;
  let totFact = 0;
  let totPorPagar = 0;
  let totPagadas = 0;
  let totAbonado = 0;
  rows.forEach((r, i) => {
    const paid = r.state === 'paid';
    const porPagar = paid ? null : (r.grossUsd ?? 0);
    const pagadas = paid ? (r.grossUsd ?? 0) : null;
    const abonado =
      r.payableId && lastIdxByBatch.get(r.payableId) === i
        ? (r.payableCoveredUsd ?? 0)
        : null;
    totFact += r.facturacionUsd ?? 0;
    totPorPagar += porPagar ?? 0;
    totPagadas += pagadas ?? 0;
    totAbonado += abonado ?? 0;
    const cells: Partial<Record<PayableCol, CellSpec>> = {
      fecha: [dateCell(rowDate(r)), { horizontal: 'center' }, 'dd/mm/yyyy'],
      proveedor: [r.providerName, { horizontal: 'left' }],
      paciente: [r.patientName, { horizontal: 'left' }],
      orden: [r.internalNumber, { horizontal: 'center' }, '@'],
      seguros: [r.insuranceName ?? NO_INSURANCE_LABEL, { horizontal: 'center' }],
      procedimiento: [r.procedure ?? '', { horizontal: 'left' }],
      facturacion: [r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      porPagar: [porPagar ?? '', { horizontal: 'center' }, '0.00'],
      pagadas: [pagadas ?? '', { horizontal: 'center' }, '0.00'],
      abonado: [abonado ?? '', { horizontal: 'center' }, '0.00'],
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
  });

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
  put(colOf('abonado'), totAbonado);
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


/**
 * Hoja "RESUMEN": cuánto se le debe a cada proveedor, de mayor a menor. Es la
 * primera hoja del libro de cuentas por pagar — el cuadro que revisa
 * administración antes de entrar al detalle.
 */
function buildPayablesSummarySheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  providers: Array<{ name: string; pendingUsd: number }>,
): void {
  const ws = wb.addWorksheet('RESUMEN', { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 22;

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('B4:C4');
  const title = ws.getCell('B4');
  title.value = 'RESUMEN CUENTAS POR PAGAR';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B5');
  rif.value = `RIF ${COMPANY.rif}`;
  rif.font = F_RIF;

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  ['NOMBRE', 'ORDENES POR PAGAR $'].forEach((h, i) => {
    const cell = headerRow.getCell(i + 2);
    cell.value = h;
    cell.font = { ...F9B, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E79' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thin();
  });
  freezeAt(ws, 6, false);

  let rowNum = 7;
  let total = 0;
  for (const prov of providers) {
    total += prov.pendingUsd;
    const row = ws.getRow(rowNum);
    const nameCell = row.getCell(2);
    nameCell.value = prov.name.toUpperCase();
    nameCell.font = F9;
    nameCell.alignment = { horizontal: 'center' };
    nameCell.border = thin();
    const amountCell = row.getCell(3);
    amountCell.value = round2(prov.pendingUsd);
    amountCell.font = F9;
    amountCell.numFmt = '#,##0.00';
    amountCell.alignment = { horizontal: 'center' };
    amountCell.border = thin();
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  const tLabel = totalsRow.getCell(2);
  tLabel.value = 'TOTAL';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  tLabel.border = thin();
  const tValue = totalsRow.getCell(3);
  tValue.value = round2(total);
  tValue.font = F9B;
  tValue.numFmt = '#,##0.00';
  tValue.alignment = { horizontal: 'center' };
  tValue.border = thin();
}

// ===========================================================================
// ESTADO DE CUENTA MENSUAL (RISLAB) — total del mes, abonos y saldo corrido
// A este proveedor no se le paga orden por orden: al cierre de cada mes pasa
// el consumo del período y se le abonan montos grandes contra ese saldo.
// ===========================================================================

const MONTH_LABEL = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

/** `YYYY-MM` de una fecha-solo; '' si no hay fecha. */
function monthKey(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 7) : '';
}

/** "JULIO" / "JULIO 2026" si el estado abarca más de un año. */
function monthLabel(key: string, showYear: boolean): string {
  const [y, m] = key.split('-');
  const name = MONTH_LABEL[Number(m) - 1] ?? key;
  return showYear ? `${name} ${y}` : name;
}

/** Un movimiento del estado de cuenta: cierre de mes o abono. */
type StatementMove =
  | { kind: 'month'; key: string; usd: number }
  | {
      kind: 'settlement';
      key: string;
      date: string | null;
      usd: number;
      ref: string;
      detail: string;
    };

/**
 * Arma los movimientos en orden cronológico: por cada mes, primero el total de
 * órdenes consumidas y después los abonos registrados en ese mismo mes.
 */
function buildStatementMoves(rows: ReportPayableRow[]): StatementMove[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const key = monthKey(rowDate(r));
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + (r.grossUsd ?? 0));
  }

  // Los abonos son del LOTE: se toman una sola vez aunque el lote tenga varias
  // órdenes en el listado.
  const seenSettlement = new Set<string>();
  const settlements: StatementMove[] = [];
  for (const r of rows) {
    for (const st of r.settlements ?? []) {
      if (seenSettlement.has(st.id)) continue;
      seenSettlement.add(st.id);
      const refs = st.payments
        .map((pay) => {
          const bank = bankAbbrev(pay);
          return [bank, pay.reference ? `REF ${pay.reference}` : '']
            .filter(Boolean)
            .join(' ');
        })
        .filter(Boolean);
      const detail = st.payments
        .map((pay) => `ABONO ${bankAbbrev(pay)}${pay.reference ? ` REF ${pay.reference}` : ''} ${formatBs(pay.amountBs)}`.trim())
        .join(' | ');
      settlements.push({
        kind: 'settlement',
        key: monthKey(st.settlementDate),
        date: st.settlementDate,
        usd: st.coveredUsd,
        ref: refs.join(' / '),
        detail: detail || `ABONO LOTE ${r.payableNumber ?? ''}`.trim(),
      });
    }
  }

  const keys = [
    ...new Set([
      ...byMonth.keys(),
      ...settlements.map((m) => m.key).filter(Boolean),
    ]),
  ].sort();

  const moves: StatementMove[] = [];
  for (const key of keys) {
    const usd = byMonth.get(key);
    if (usd != null) moves.push({ kind: 'month', key, usd });
    const ofMonth = settlements
      .filter((m) => m.key === key)
      .sort((a, b) =>
        a.kind === 'settlement' && b.kind === 'settlement'
          ? (a.date ?? '').localeCompare(b.date ?? '')
          : 0,
      );
    moves.push(...ofMonth);
  }
  // Abonos sin fecha reconocible: al final, para no perderlos.
  moves.push(...settlements.filter((m) => !m.key));
  return moves;
}

/**
 * Estado de cuenta mensual de un proveedor tipo laboratorio: una fila por mes
 * con el total de órdenes y, debajo, cada abono con su referencia y el saldo
 * que va quedando.
 */
export async function downloadMonthlyStatementXlsx(
  rows: ReportPayableRow[],
  opts: { providerName?: string; openingBalanceUsd?: number } = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  const providerName = (
    opts.providerName ||
    rows[0]?.providerName ||
    MONTHLY_STATEMENT_LABEL
  ).toUpperCase();

  const ws = wb.addWorksheet(MONTHLY_STATEMENT_LABEL.slice(0, 31), {
    views: [{ showGridLines: false }],
  });
  const WIDTHS = [4, 14, 14, 12, 14, 22, 52];
  WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  const moves = buildStatementMoves(rows);
  const years = [
    ...new Set(moves.map((m) => m.key.slice(0, 4)).filter(Boolean)),
  ].sort();
  const showYear = years.length > 1;
  const periodLabel =
    years.length === 1 ? `AÑO ${years[0]}` : years.length > 1 ? `AÑOS ${years[0]} - ${years[years.length - 1]}` : '';

  ws.mergeCells('E2:G2');
  const title = ws.getCell('E2');
  title.value = providerName;
  title.font = F12B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells('E3:G3');
  const sub = ws.getCell('E3');
  sub.value = 'ESTADO DE CUENTA';
  sub.font = F11B;
  sub.alignment = { horizontal: 'center' };

  ws.mergeCells('E4:G4');
  const period = ws.getCell('E4');
  period.value = periodLabel;
  period.font = F9B;
  period.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B4');
  rif.value = COMPANY.rif;
  rif.font = F11B;

  const HEADERS = [
    'FECHA',
    'ORDENES POR PAGAR $',
    'ABONOS $',
    'SALDO PENDIENTE $',
    'REF',
    'REF DEL PAGO',
  ];
  const headerRow = ws.getRow(6);
  headerRow.height = 32;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 2);
    cell.value = h;
    cell.font = F9B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });
  freezeAt(ws, 6, false);

  let rowNum = 7;
  let saldo = opts.openingBalanceUsd ?? 0;

  /** Escribe una fila del estado (las celdas vacías conservan el borde). */
  const writeMove = (cells: Array<[number, ExcelJS.CellValue, string?]>): void => {
    const row = ws.getRow(rowNum);
    for (let col = 2; col <= 7; col += 1) {
      const cell = row.getCell(col);
      cell.font = F9;
      cell.border = thin();
      cell.alignment = { horizontal: col === 7 ? 'left' : 'center', wrapText: col === 7 };
    }
    for (const [col, value, numFmt] of cells) {
      const cell = row.getCell(col);
      cell.value = value;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
    }
    rowNum += 1;
  };

  if (opts.openingBalanceUsd) {
    writeMove([
      [2, 'SALDO ANTERIOR'],
      [5, round2(saldo), '#,##0.00'],
    ]);
  }

  for (const m of moves) {
    if (m.kind === 'month') {
      saldo = round2(saldo + m.usd);
      writeMove([
        [2, monthLabel(m.key, showYear)],
        [3, round2(m.usd), '#,##0.00'],
        [5, saldo, '#,##0.00'],
      ]);
    } else {
      saldo = round2(saldo - m.usd);
      writeMove([
        [2, dateCell(m.date) ?? '', 'dd/mm/yyyy'],
        [4, round2(m.usd), '#,##0.00'],
        [5, saldo, '#,##0.00'],
        [6, m.ref],
        [7, m.detail],
      ]);
    }
  }

  const totalsRow = ws.getRow(rowNum + 1);
  for (let col = 2; col <= 5; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(4);
  tLabel.value = 'TOTAL:';
  tLabel.font = F9B;
  tLabel.alignment = { horizontal: 'right' };
  const tValue = totalsRow.getCell(5);
  tValue.value = round2(saldo);
  tValue.font = F9B;
  tValue.numFmt = '#,##0.00';
  tValue.alignment = { horizontal: 'center' };

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Estado-de-cuenta-${safeFilenameSegment(providerName)}.xlsx`,
  );
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

  // Los proveedores con estado de cuenta mensual (RISLAB) tienen su propio
  // documento: no entran ni en el resumen ni en las hojas de este libro.
  const bookRows = rows.filter(
    (r) => !isMonthlyStatementProvider(r.providerName),
  );

  // Agrupa por proveedor conservando el orden de aparición.
  const groups = new Map<string, { name: string; rows: ReportPayableRow[] }>();
  for (const r of bookRows) {
    const key = providerKey(r);
    let g = groups.get(key);
    if (!g) {
      g = { name: r.providerName, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(r);
  }

  // Primera hoja siempre: el resumen de cuánto se le debe a cada proveedor.
  buildPayablesSummarySheet(
    wb,
    logoId,
    Array.from(groups.values())
      .map((g) => ({ name: g.name, pendingUsd: pendingUsdOf(g.rows) }))
      .sort((a, b) => b.pendingUsd - a.pendingUsd),
  );

  const used = new Set<string>(['resumen']);
  if (groups.size > 1) {
    // Luego la lista plana única y una hoja por proveedor.
    used.add('lista general');
    buildFlatSheet(wb, bookRows, includeFacturacion);
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
    else buildFlatSheet(wb, bookRows, includeFacturacion);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const suffix = groups.size === 1 ? safeFilenameSegment(bookRows[0]?.providerName ?? 'proveedor') : 'general';
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
  'N° CLAVE',
  'N° FACTURA',
  'N° CONTROL',
  'N° ORDEN INTERNA',
  'MONTO FACTURADO $',
  'TASA DEL DIA',
  'MONTO FACTURADO Bs',
  'COSTO',
];

/**
 * Una factura anulada conserva su renglón (el correlativo no se salta) pero sin
 * datos: la palabra "ANULADA" va SÓLO en la columna CLIENTE y el monto en Bs
 * se imprime en 0,00 (pedido del cliente, 28/10/2026).
 */
const CANCELLED_LABEL = 'ANULADA';

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
  const widths = [12, 24, 24, 14, 24, 14, 20, 15, 12, 12, 14, 15, 11, 16, 10];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('B2:O2');
  const title = ws.getCell('B2');
  title.value = 'RELACION DE INGRESOS';
  title.font = F11B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells('B3:O3');
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
  freezeAt(ws, 6);

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
      [2, cancelled ? CANCELLED_LABEL : r.clientName, { horizontal: 'left' }],
      [3, cancelled ? '' : r.holderName, { horizontal: 'left' }],
      [4, cancelled ? '' : r.holderId, { horizontal: 'left' }],
      [5, cancelled ? '' : r.patientName, { horizontal: 'left' }],
      [6, cancelled ? '' : r.patientId, { horizontal: 'left' }],
      [7, cancelled ? '' : r.doctorName, { horizontal: 'left' }],
      [8, cancelled ? '' : r.serviceKey, { horizontal: 'center' }, '@'],
      [9, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [10, r.controlNumber, { horizontal: 'center' }, '@'],
      [11, cancelled ? '' : r.internalNumbers || r.orderNumbers, { horizontal: 'center' }, '@'],
      [12, cancelled ? '' : r.amountUsd, { horizontal: 'center' }, '0.00'],
      [13, cancelled ? '' : (r.rateBs ?? ''), { horizontal: 'center' }, '0.00'],
      // Las anuladas van con 0,00 en Bs, no en blanco.
      [14, cancelled ? 0 : (r.amountBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
      [15, cancelled ? '' : r.costUsd, { horizontal: 'center' }, '#,##0.00'],
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
  for (let col = 1; col <= 15; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thin();
  }
  const label = totalsRow.getCell(11);
  label.value = 'TOTALES';
  label.alignment = { horizontal: 'right' };
  const put = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = round2(val);
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  put(12, totalUsd, '0.00');
  put(14, totalBs, '#,##0.00');
  put(15, totalCosto, '#,##0.00');
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
  freezeAt(ws, 3);

  let rowNum = 4;
  let totalUsd = 0;
  let totalBs = 0;
  for (const r of rows) {
    const cancelled = r.status === 'cancelled';
    totalUsd += cancelled ? 0 : r.amountUsd;
    totalBs += cancelled ? 0 : (r.amountBs ?? 0);
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [3, dateCell(r.invoiceDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [4, cancelled ? CANCELLED_LABEL : r.clientName, { horizontal: 'left' }],
      [5, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [6, cancelled ? '' : r.amountUsd, { horizontal: 'center' }, '0.00'],
      [7, cancelled ? '' : (r.rateBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
      [8, cancelled ? 0 : (r.amountBs ?? ''), { horizontal: 'center' }, '#,##0.00'],
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
