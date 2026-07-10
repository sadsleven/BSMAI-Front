import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { safeFilenameSegment } from '@/modules/orders/presentation/components/orderExcel';
import type {
  ReportPayableRow,
  ReportReceivableRow,
} from '../../infrastructure/reportsGateway';

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

  const widths = [12, 22, 22, 13, 22, 13, 18, 16, 12, 11, 11, 12, 13, 11, 14, 11];
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
    'FECHA RECEPCIÓN ORDEN DE SERVICIO',
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
      [8, dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [9, r.serviceKey, { horizontal: 'center' }, '@'],
      [10, r.invoiceNumber, { horizontal: 'center' }, '@'],
      [11, r.controlNumber, { horizontal: 'center' }, '@'],
      [12, r.orderNumber, { horizontal: 'center' }, '@'],
      [13, usd, { horizontal: 'center' }, '0.00'],
      [14, rate ?? '', { horizontal: 'center' }, '0.00'],
      [15, bs ?? '', { horizontal: 'center' }, '#,##0.00'],
      [16, firstPortionOfOrder ? r.costoUsd ?? 0 : '', { horizontal: 'center' }, '#,##0.00'],
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
  for (let col = 1; col <= 16; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thin();
  }
  const label = totalsRow.getCell(12);
  label.value = 'TOTALES';
  label.alignment = { horizontal: 'right' };
  const setTotal = (col: number, val: number, fmt: string) => {
    const c = totalsRow.getCell(col);
    c.value = val;
    c.numFmt = fmt;
    c.alignment = { horizontal: 'center' };
  };
  setTotal(13, Math.round(totalUsd * 100) / 100, '0.00');
  setTotal(15, Math.round(totalBs * 100) / 100, '#,##0.00');
  setTotal(16, Math.round(totalCosto * 100) / 100, '#,##0.00');

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

/** Hoja "EDO. DE CUENTA" de UN proveedor (formato de la plantilla). */
async function buildProviderSheet(
  wb: ExcelJS.Workbook,
  logoId: number | null,
  sheetName: string,
  providerName: string,
  rows: ReportPayableRow[],
): Promise<void> {
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  const widths = [4, 12, 22, 9, 16, 20, 13, 14, 13, 12, 12, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 1, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  ws.mergeCells('E2:L2');
  const name = ws.getCell('E2');
  name.value = providerName.toUpperCase();
  name.font = F12B;
  name.alignment = { horizontal: 'center' };

  const rif = ws.getCell('B3');
  rif.value = COMPANY.rif;
  rif.font = F11B;
  ws.mergeCells('E3:L3');
  const sub = ws.getCell('E3');
  sub.value = 'EDO. DE CUENTA';
  sub.font = F11B;
  sub.alignment = { horizontal: 'center' };

  const HEADERS = [
    'FECHA',
    'NOMBRE DEL PACIENTE',
    'Nº ORDEN',
    'SEGUROS',
    'PROCEDIMIENTO',
    'FACTURACION $',
    'ORDENES POR PAGAR $',
    'ORDENES PAGADAS $',
    'MONTO PAGADO $',
    'FECHA DE PAGO',
    'REF DEL PAGO',
  ];
  const headerRow = ws.getRow(5);
  headerRow.height = 30;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 2); // desde col B
    cell.value = h;
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
    const refPago = isLastPaid ? (r.paymentReference ?? '') : '';

    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [2, dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [3, r.patientName, { horizontal: 'left' }],
      [4, r.internalNumber, { horizontal: 'center' }, '@'],
      [5, r.insuranceName ?? 'PARTICULAR', { horizontal: 'center' }],
      [6, r.procedure ?? '', { horizontal: 'center' }],
      [7, r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      [8, porPagar ?? '', { horizontal: 'center' }, '0.00'],
      [9, pagadas ?? '', { horizontal: 'center' }, '0.00'],
      [10, montoPagado, { horizontal: 'center' }, '0.00'],
      [11, fechaPago, { horizontal: 'center' }, 'dd/mm/yyyy'],
      [12, refPago, { horizontal: 'center' }],
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F9;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  });

  // Totales.
  const totalsRow = ws.getRow(rowNum);
  for (let col = 2; col <= 12; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(6);
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
  put(7, totFact);
  put(8, totPorPagar);
  put(9, totPagadas);
}

/** Hoja plana con TODAS las obligaciones (primera hoja cuando hay >1 proveedor). */
function buildFlatSheet(wb: ExcelJS.Workbook, rows: ReportPayableRow[]): void {
  const ws = wb.addWorksheet('LISTA GENERAL', { views: [{ showGridLines: true }] });
  const widths = [12, 24, 22, 9, 16, 20, 13, 14, 13, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const title = ws.getCell('A1');
  title.value = `RELACION DE CUENTAS POR PAGAR — RIF ${COMPANY.rif}`;
  title.font = F_RIF;

  const HEADERS = [
    'FECHA',
    'PROVEEDOR',
    'NOMBRE DEL PACIENTE',
    'Nº ORDEN',
    'SEGUROS',
    'PROCEDIMIENTO',
    'FACTURACION $',
    'ORDENES POR PAGAR $',
    'ORDENES PAGADAS $',
    'ESTADO',
  ];
  const headerRow = ws.getRow(3);
  headerRow.height = 30;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
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
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [1, dateCell(r.orderDate), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [2, r.providerName, { horizontal: 'left' }],
      [3, r.patientName, { horizontal: 'left' }],
      [4, r.internalNumber, { horizontal: 'center' }, '@'],
      [5, r.insuranceName ?? 'PARTICULAR', { horizontal: 'center' }],
      [6, r.procedure ?? '', { horizontal: 'left' }],
      [7, r.facturacionUsd ?? 0, { horizontal: 'center' }, '0.00'],
      [8, porPagar ?? '', { horizontal: 'center' }, '0.00'],
      [9, pagadas ?? '', { horizontal: 'center' }, '0.00'],
      [10, STATE[r.state] ?? r.state, { horizontal: 'center' }],
    ];
    const row = ws.getRow(rowNum);
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F9;
      if (alignment) cell.alignment = alignment;
      if (numFmt && value !== '' && value != null) cell.numFmt = numFmt;
      cell.border = thin();
    }
    rowNum += 1;
  }

  const totalsRow = ws.getRow(rowNum);
  for (let col = 1; col <= 10; col += 1) totalsRow.getCell(col).border = thin();
  const tLabel = totalsRow.getCell(6);
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
  put(7, totFact);
  put(8, totPorPagar);
  put(9, totPagadas);
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

export async function downloadPayablesReportXlsx(rows: ReportPayableRow[]): Promise<void> {
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
    buildFlatSheet(wb, rows);
    for (const g of groups.values()) {
      await buildProviderSheet(wb, logoId, sheetName(g.name, used), g.name, g.rows);
    }
  } else {
    // Un solo proveedor: sólo su hoja.
    const g = groups.values().next().value as { name: string; rows: ReportPayableRow[] } | undefined;
    if (g) await buildProviderSheet(wb, logoId, sheetName(g.name, used), g.name, g.rows);
    else buildFlatSheet(wb, rows);
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
