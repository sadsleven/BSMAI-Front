import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import {
  holderDisplayId,
  holderDisplayName,
} from '@/modules/orders/domain/models/order';
import { safeFilenameSegment } from '@/modules/orders/presentation/components/orderExcel';
import type {
  AccountsReceivableBatch,
  AccountsReceivableOrder,
} from '../../domain/models/accountsReceivable';

const COMPANY = {
  name: 'ATENCIÓN MÉDICA AFMI',
  rif: 'J-50190282-8',
};

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

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, left: s, right: s, bottom: s };
}

const F8: Partial<ExcelJS.Font> = { name: 'Calibri', size: 8 };
const F8B: Partial<ExcelJS.Font> = { ...F8, bold: true };
const F8_BLUE: Partial<ExcelJS.Font> = { ...F8, bold: true, color: { argb: 'FF002060' } };

function orderDateOf(o: AccountsReceivableOrder): Date | null {
  const iso = o.order?.orderDate ?? o.order?.createdAt ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Estado de cuenta para lotes cuyo deudor es un SEGURO (template
 * "EDOS DE CUENTA SEGUROS INDEXADO- NO INDEXADO.xlsx"):
 *  - Seguro indexado (isIndexed=false, lote modo USD): la tasa de TODAS las
 *    filas es la seleccionada en la card Resumen (`usdRate`, requerida).
 *    Monto Bs por fila = fórmula $ × tasa; fila final de totales.
 *  - Seguro no indexado (isIndexed=true, lote modo tasa fija): sólo montos en $
 *    (sin columnas de tasa/Bs ni línea de corte "AL:").
 */
export async function downloadEstadoCuentaSeguro(
  batch: AccountsReceivableBatch,
  usdRate: ExchangeRate | null,
): Promise<void> {
  const fixed = (batch.mode ?? 'usd') === 'fixed';
  if (!fixed && !usdRate) {
    throw new Error('Selecciona la tasa en el Resumen para descargar el estado de cuenta');
  }
  const insuranceName = (batch.insurance?.name ?? '—').toUpperCase();

  // Modo tasa fija (no indexado): sin columnas TASA DEL DIA / MONTO FACTURADO Bs → última col J.
  const lastCol = fixed ? 10 : 12;
  const lastColLetter = fixed ? 'J' : 'L';

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  const ws = wb.addWorksheet('ESTADO DE CUENTA', {
    views: [{ showGridLines: true }],
  });

  // Col A amplia para que "RIF J-50190282-8" quepa bajo el logo sin cortarse.
  const widths = [15, 22, 22.43, 12, 21.29, 11.86, 11.57, 11, 11.71, 11, 9.5, 12];
  widths.slice(0, lastCol).forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // Logo arriba-izquierda (A1), mismo anclaje y tamaño que las órdenes internas
  // y que el template original del estado de cuenta.
  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  // ExcelJS interpreta los Date en UTC: anclar el día local a mediodía UTC para
  // que después de las 20:00 VE no imprima la fecha de mañana.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));

  // Fila 1: fecha de emisión a la derecha.
  const emitted = ws.getCell(`${lastColLetter}1`);
  emitted.value = today;
  emitted.numFmt = 'dd/mm/yyyy';
  emitted.font = F8;
  emitted.alignment = { horizontal: 'center' };

  // Filas 3-4: encabezado (nombre del seguro, título, RIF AFMI).
  ws.mergeCells(`B3:${lastColLetter}3`);
  const title = ws.getCell('B3');
  title.value = insuranceName;
  title.font = F8B;
  title.alignment = { horizontal: 'center' };

  ws.mergeCells(`B4:${lastColLetter}4`);
  const subtitle = ws.getCell('B4');
  subtitle.value = 'ESTADO DE CUENTA';
  subtitle.font = F8B;
  subtitle.alignment = { horizontal: 'center' };

  // RIF de AFMI justo debajo del logo (el logo cubre las filas 1-2 de la col A).
  const rifCell = ws.getCell('A3');
  rifCell.value = `RIF ${COMPANY.rif}`;
  rifCell.font = F8_BLUE;
  rifCell.alignment = { horizontal: 'left' };

  // Fila 7: cabecera de la tabla (modo tasa fija: sin cols de tasa/Bs).
  const HEADERS = [
    'FECHA',
    fixed ? 'NOMBRE CLIENTE' : 'CLIENTE',
    'NOMBRE DEL TITULAR',
    'CI TITULAR',
    'NOMBRE DEL PACIENTE',
    'CI: PACIENTE',
    'N° CLAVE',
    'N° FACTURA',
    'N° CONTROL',
    'MONTO FACTURADO $',
    ...(fixed ? [] : ['TASA DEL DIA', 'MONTO FACTURADO Bs']),
  ];
  const headerRow = ws.getRow(7);
  headerRow.height = 48;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = F8B;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  // Filas de datos: una por orden del lote, cronológicas.
  const pivots = [...(batch.orders ?? [])].sort((a, b) => {
    const da = orderDateOf(a)?.getTime() ?? 0;
    const db = orderDateOf(b)?.getTime() ?? 0;
    if (da !== db) return da - db;
    return (a.order?.orderNumber ?? '').localeCompare(b.order?.orderNumber ?? '');
  });

  const selectedRateBs = Number(usdRate?.amountBs ?? 0);
  let rowNum = 8;
  for (const p of pivots) {
    const o = p.order;
    // targetUsd del pivot = snapshot de la porción (una orden mixta sólo trae
    // su porción fija a este lote); fallback al total para lotes legacy.
    const amountUsd = Number(p.targetUsd ?? o?.priceAmount ?? 0);

    const row = ws.getRow(rowNum);
    const values: Array<[number, ExcelJS.CellValue, Partial<ExcelJS.Alignment>?, string?]> = [
      [1, orderDateOf(p), { horizontal: 'center' }, 'dd/mm/yyyy'],
      [2, insuranceName, { horizontal: 'left' }],
      [3, holderDisplayName(o?.holder), { horizontal: 'left' }],
      [4, holderDisplayId(o?.holder), { horizontal: 'left' }],
      [5, holderDisplayName(o?.patient), { horizontal: 'left' }],
      [6, holderDisplayId(o?.patient), { horizontal: 'left' }],
      [7, o?.serviceKey ?? '', { horizontal: 'center' }],
      [8, o?.invoiceNumber ?? '', { horizontal: 'center' }, '@'],
      [9, o?.controlNumber ?? '', { horizontal: 'center' }, '@'],
      [10, amountUsd, { horizontal: 'center' }, '#,##0.00'],
    ];
    if (!fixed) {
      values.push(
        [11, selectedRateBs, { horizontal: 'center' }, '#,##0.00'],
        [
          12,
          { formula: `J${rowNum}*K${rowNum}`, result: amountUsd * selectedRateBs },
          { horizontal: 'center' },
          '#,##0.00',
        ],
      );
    }
    for (const [col, value, alignment, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      cell.font = F8;
      if (alignment) cell.alignment = alignment;
      if (numFmt) cell.numFmt = numFmt;
      cell.border = thinBorder();
    }
    rowNum += 1;
  }

  // Fila de totales.
  const totalsRow = ws.getRow(rowNum);
  const totalUsd = pivots.reduce((s, p) => {
    const o = p.order;
    return s + Number(p.targetUsd ?? o?.priceAmount ?? 0);
  }, 0);

  // Bordes en TODA la fila de totales, aun en celdas vacías.
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = totalsRow.getCell(col);
    cell.font = F8B;
    cell.border = thinBorder();
  }

  const labelCell = totalsRow.getCell(fixed ? 6 : 1);
  labelCell.value = fixed ? 'TOTAL POR COBRAR' : 'TOTALES';
  labelCell.alignment = { horizontal: 'center' };

  const sumUsdCell = totalsRow.getCell(10);
  sumUsdCell.value =
    rowNum > 8
      ? { formula: `SUM(J8:J${rowNum - 1})`, result: totalUsd }
      : totalUsd;
  sumUsdCell.alignment = { horizontal: 'center' };
  sumUsdCell.numFmt = '#,##0.00';

  if (!fixed) {
    const totalBs = pivots.reduce((s, p) => {
      const o = p.order;
      const usd = Number(p.targetUsd ?? o?.priceAmount ?? 0);
      return s + usd * selectedRateBs;
    }, 0);
    const sumBsCell = totalsRow.getCell(12);
    sumBsCell.value =
      rowNum > 8
        ? { formula: `SUM(L8:L${rowNum - 1})`, result: totalBs }
        : totalBs;
    sumBsCell.alignment = { horizontal: 'center' };
    sumBsCell.numFmt = '#,##0.00';
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Estado-de-cuenta-Lote-${safeFilenameSegment(
    batch.receivableNumber,
  )}-${safeFilenameSegment(batch.insurance?.name ?? 'seguro')}.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}
