import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Order, OrderServiceTypeRow } from '../../domain/models/order';
import {
  holderDisplayName,
  orderInvoiceDate,
  orderServiceKeyDisplay,
} from '../../domain/models/order';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import { formatDateOnly } from '@/lib/dates';

const COMPANY = {
  name: 'ATENCIÓN MÉDICA AFMI',
  rif: 'J-50190282-8',
  domicilio: 'Av. Bomplant con 4ta. Transversal de la Av. Gran Mariscal, oficina 01',
  ciudad: 'Cumaná. Edo. Sucre.',
  telefono: '0293-4337343',
  email: 'atencionfamiliarmedicointegral@gmail.com',
};

function holderId(p?: { cedula?: string | null; rif?: string | null } | null): string {
  if (!p) return '';
  return p.cedula ?? p.rif ?? '';
}

// `orderDate` es columna `date` (string YYYY-MM-DD): formatear sin `new Date`
// para no imprimir el día anterior en UTC-4.
const fmtDate = formatDateOnly;

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, left: s, right: s, bottom: s };
}

/** Sanitiza string para nombre de archivo (sin chars problemáticos en Windows/macOS). */
export function safeFilenameSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 80) || 'sin_nombre';
}

function ageFromBirthDate(iso?: string | null): string {
  if (!iso) return '';
  // Mediodía local: `new Date('YYYY-MM-DD')` es medianoche UTC y en VE (UTC-4)
  // los getters locales devuelven el día anterior.
  const b = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(b.getTime())) return '';
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  if (months < 0 || months >= 150 * 12) return '';
  // Bebés (<1 año) se expresan en meses.
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return String(Math.floor(months / 12));
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

/**
 * Tasa USD/Bs con la que MÁS dinero entró en los pagos del Paso 1: agrupa los
 * pagos en Bs por su tasa snapshot y devuelve la del grupo que más pagó
 * (comparando el equivalente en USD, que es lo que mide cuánto se pagó de
 * verdad). Empate → la tasa con fecha efectiva más reciente.
 *
 * Los pagos en USD no llevan tasa y los de EUR llevan EUR/Bs: ninguno participa.
 * Devuelve `null` cuando la orden no tiene pagos en Bs (seguro, crédito).
 *
 * Es el valor por defecto del selector de tasa de la factura (Paso 4) para las
 * órdenes que se pagaron en bolívares.
 */
export function dominantPaymentRate(
  order: Order,
): { id: string; rate: number } | null {
  const totals = new Map<
    string,
    { id: string; usd: number; rate: number; effectiveDate: string }
  >();
  for (const p of order.payments ?? []) {
    if (p.amountCurrency !== 'BS') continue;
    const r = p.exchangeRate;
    if (!r || r.currency !== 'USD') continue;
    const rate = Number(r.amountBs) || 0;
    const amountBs = Number(p.amountValue) || 0;
    if (rate <= 0 || amountBs <= 0) continue;
    const acc = totals.get(r.id) ?? {
      id: r.id,
      usd: 0,
      rate,
      effectiveDate: r.effectiveDate ?? '',
    };
    acc.usd += amountBs / rate;
    totals.set(r.id, acc);
  }
  let best: {
    id: string;
    usd: number;
    rate: number;
    effectiveDate: string;
  } | null = null;
  for (const t of totals.values()) {
    if (
      !best ||
      t.usd > best.usd + 0.005 ||
      (Math.abs(t.usd - best.usd) <= 0.005 && t.effectiveDate > best.effectiveDate)
    ) {
      best = t;
    }
  }
  return best ? { id: best.id, rate: best.rate } : null;
}

function dominantPaymentRateBs(order: Order): number {
  return dominantPaymentRate(order)?.rate ?? 0;
}

/**
 * Tasa USD/Bs de la FACTURA (Paso 4) — alimenta el campo "Tasa de cambio BCV" y
 * todos los montos en Bs del documento. Precedencia:
 *  1. Tasa **elegida** en el Paso 4 (`invoiceExchangeRate`): manda siempre.
 *  2. Orden con tasa fija (seguro no indexado): su snapshot.
 *  3. Tasa del pago dominante del Paso 1 ({@link dominantPaymentRate}): la
 *     factura queda a la tasa a la que realmente se cobró.
 *  4. Tasa vigente al CREAR la orden (órdenes sin pagos: seguro, crédito).
 *  5. Tasa de facturación snapshot; sino 0 (montos sin convertir).
 *
 * Los pasos 2-5 sólo aplican a órdenes facturadas antes de que la tasa fuese
 * seleccionable (sin `invoiceExchangeRate`): conservan su factura original.
 */
export async function resolveInvoiceRateBs(order: Order): Promise<number> {
  if (order.invoiceExchangeRate) {
    const chosen = Number(order.invoiceExchangeRate.amountBs) || 0;
    if (chosen > 0) return chosen;
  }
  if (order.useFixedRate && order.fixedExchangeRate) {
    const fixed = Number(order.fixedExchangeRate.amountBs) || 0;
    if (fixed > 0) return fixed;
  }
  const paid = dominantPaymentRateBs(order);
  if (paid > 0) return paid;
  const at = order.createdAt ?? order.orderDate;
  try {
    const { data } = await exchangeRateGateway.list({
      currency: 'USD',
      effectiveDateTo: at,
      isActive: true,
      sortBy: 'effectiveDate',
      sortDir: 'DESC',
      page: 1,
      limit: 1,
    });
    const rate = Number(data[0]?.amountBs) || 0;
    if (rate > 0) return rate;
  } catch {
    // sin acceso a tasas — cae al fallback
  }
  return order.billingExchangeRate
    ? Number(order.billingExchangeRate.amountBs) || 0
    : 0;
}

export interface OrderProviderGroup {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  /** Dirección del centro donde atiende el doctor / del centro de atención. */
  providerCenterAddress: string;
  /** Número de orden interna de ESTE proveedor (lo que se imprime, no el base). */
  providerOrderNumber: string;
  /**
   * Especialidades de las filas de este proveedor (normalmente una). Es lo que
   * se imprime en la orden interna: una orden puede combinar especialidades
   * (ej. laboratorio en un centro + rayos X en otro) y cada orden interna
   * muestra la suya, no la principal de la orden.
   */
  specialtyNames: string[];
  rows: OrderServiceTypeRow[];
}

/** Etiqueta de especialidad de un grupo (proveedor) para Excel/PDF. */
export function groupSpecialtyLabel(group: OrderProviderGroup): string {
  return group.specialtyNames.join(' / ').toUpperCase();
}

/**
 * Etiqueta de "Referencia" para la orden interna — SÓLO para estos archivos
 * (Excel/PDF). Seguro → nombre corto (o nombre si no tiene); Cashea → "Cashea";
 * Contado y Crédito → "AFMI".
 */
export function orderReferenceLabel(order: Order): string {
  switch (order.type) {
    case 'insurance':
      return (order.insurance?.shortName?.trim() || order.insurance?.name) ?? '';
    case 'cashea':
      return 'Cashea';
    case 'credit':
    case 'cash':
      return 'AFMI';
    default:
      return '';
  }
}

/**
 * Número de orden interna de un proveedor de la orden. Lo resuelve desde
 * `order.internalOrders`; si faltara (orden vieja o no recargada), cae al
 * número BASE de la orden para no imprimir vacío.
 */
export function providerInternalNumber(
  order: Order,
  providerType: 'doctor' | 'care_center',
  providerId: string,
): string {
  const iio = (order.internalOrders ?? []).find(
    (o) =>
      o.providerType === providerType &&
      (providerType === 'doctor' ? o.doctorId : o.careCenterId) === providerId,
  );
  return iio?.internalNumber ?? order.orderNumber;
}

/** Agrupa las filas OST por proveedor distinto. */
export function groupOrderProviders(order: Order): OrderProviderGroup[] {
  const groups = new Map<string, OrderProviderGroup>();
  for (const row of order.orderServiceTypes ?? []) {
    const id = row.providerType === 'doctor' ? row.doctorId : row.careCenterId;
    if (!id) continue;
    const key = `${row.providerType}:${id}`;
    if (!groups.has(key)) {
      const name =
        row.providerType === 'doctor'
          ? `${row.doctor?.firstName ?? ''} ${row.doctor?.lastName ?? ''}`.trim() ||
            row.doctorId ||
            ''
          : row.careCenter?.businessName ?? row.careCenterId ?? '';
      const centerAddress =
        row.providerType === 'doctor'
          ? row.doctor?.centerAddress ?? ''
          : row.careCenter?.centerAddress ?? '';
      groups.set(key, {
        key,
        providerType: row.providerType,
        providerId: id,
        providerName: name,
        providerCenterAddress: centerAddress,
        providerOrderNumber: providerInternalNumber(order, row.providerType, id),
        specialtyNames: [],
        rows: [],
      });
    }
    const group = groups.get(key)!;
    group.rows.push(row);
    // Especialidad de la fila (fallback a la principal de la orden en órdenes
    // previas a la especialidad por fila). Sin repetir.
    const spName = row.specialty?.name ?? order.specialty?.name ?? '';
    if (spName && !group.specialtyNames.includes(spName)) {
      group.specialtyNames.push(spName);
    }
  }
  return Array.from(groups.values());
}

export async function downloadFacturacionXlsx(order: Order): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('FACTURACION');

  // Anchos exactos al template FACTURA.xlsx
  ws.columns = [
    { width: 17.57 },
    { width: 6.14 },
    { width: 39 },
    { width: 10.57 },
    { width: 12.86 },
  ];

  const DEFAULT_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10 };
  const SMALL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9 };
  const BOLD_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true };

  const isInsurance = order.type === 'insurance';
  const insurancePhone = order.insurance?.phones?.[0]?.number ?? '';
  const holder = holderDisplayName(order.holder);
  const patient = holderDisplayName(order.patient);
  const holderCi = holderId(order.holder);
  const patientCi = holderId(order.patient);

  // Contratante de la factura: seguro → datos del seguro;
  // contado/crédito/cashea → datos del titular.
  const contratanteName = isInsurance ? order.insurance?.name ?? '' : holder;
  const contratanteAddress = isInsurance
    ? order.insurance?.fiscalAddress ?? ''
    : order.holder?.address ?? '';
  const contratanteRif = isInsurance ? order.insurance?.rif ?? '' : holderCi;
  const contratantePhone = isInsurance
    ? insurancePhone
    : order.holder?.phones?.[0]?.number ?? '';
  const contratante = isInsurance
    ? order.insuranceSource === 'direct'
      ? holder
      : order.contractor?.name ?? ''
    : holder;

  // Condiciones de pago: insurance/credit/cashea → CREDITO ; cash → CONTADO
  const condicionesPago =
    order.type === 'cash' ? 'CONTADO' : 'CREDITO';

  // Conversión a Bs vía tasa más reciente vigente al crear la orden
  const rateBs = await resolveInvoiceRateBs(order);
  const priceFx = Number(order.priceAmount) || 0;
  const priceBs = rateBs > 0 ? priceFx * rateBs : priceFx;
  const currencySymbol = '$';

  // Espacios superiores
  ws.getRow(1).height = 21;
  ws.getRow(2).height = 15.75;

  // R3 — Fecha de emisión
  const r3 = ws.getRow(3);
  r3.getCell(4).value = 'Fecha de Emisión:';
  r3.getCell(4).font = DEFAULT_FONT;
  r3.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  r3.getCell(5).value = fmtDate(orderInvoiceDate(order));
  r3.getCell(5).font = SMALL_FONT;
  r3.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  const wrapLeft: Partial<ExcelJS.Alignment> = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true,
  };
  const wrapLeftTop: Partial<ExcelJS.Alignment> = {
    horizontal: 'left',
    vertical: 'top',
    wrapText: true,
  };

  // R4 — Razón social — valor mergeado C:E. Seguro → nombre del seguro; resto → titular.
  {
    const c4a = ws.getCell('A4');
    c4a.value = 'Nombre  o Razón Social :';
    c4a.font = DEFAULT_FONT;
    c4a.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells('C4:E4');
    const c4c = ws.getCell('C4');
    c4c.value = contratanteName;
    c4c.font = DEFAULT_FONT;
    c4c.alignment = wrapLeft;
    // Excel no auto-ajusta filas con celdas mergeadas: altura explícita.
    const nameLines = Math.max(1, Math.ceil(contratanteName.length / 78));
    ws.getRow(4).height = 2.25 + nameLines * 13.5;
  }

  // R5 — Dirección fiscal — valor mergeado C:E. Seguro → seguro; resto → titular.
  {
    const fiscalAddress = contratanteAddress;
    const c5a = ws.getCell('A5');
    c5a.value = 'Dirección Fiscal :';
    c5a.font = DEFAULT_FONT;
    c5a.alignment = { horizontal: 'left', vertical: 'top' };
    ws.mergeCells('C5:E5');
    const c5c = ws.getCell('C5');
    c5c.value = fiscalAddress;
    c5c.font = DEFAULT_FONT;
    c5c.alignment = wrapLeftTop;
    // Excel no auto-ajusta filas con celdas mergeadas: altura explícita.
    // Merge C:E ≈ 62 unidades de ancho ≈ 78 chars en Calibri 10.
    const addressLines = Math.max(1, Math.ceil(fiscalAddress.length / 78));
    ws.getRow(5).height = 2.25 + addressLines * 13.5;
  }

  // R6 — RIF + Teléfono — teléfono mergeado D:E. Seguro → seguro; resto → titular.
  {
    const c6a = ws.getCell('A6');
    c6a.value = 'Rif ó CI:';
    c6a.font = DEFAULT_FONT;
    c6a.alignment = { horizontal: 'left', vertical: 'middle' };
    const c6c = ws.getCell('C6');
    c6c.value = contratanteRif;
    c6c.font = DEFAULT_FONT;
    c6c.alignment = wrapLeft;
    ws.mergeCells('D6:E6');
    const c6d = ws.getCell('D6');
    c6d.value = contratantePhone ? `Teléfono:(${contratantePhone})` : 'Teléfono:';
    c6d.font = SMALL_FONT;
    c6d.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  }

  // R7 — Contratante — valor mergeado C:E. Seguro directo al paciente / no seguro → el titular.
  {
    const c7a = ws.getCell('A7');
    c7a.value = 'Contratante:';
    c7a.font = DEFAULT_FONT;
    c7a.alignment = { horizontal: 'left', vertical: 'top' };
    ws.mergeCells('C7:E7');
    const c7c = ws.getCell('C7');
    c7c.value = contratante;
    c7c.font = SMALL_FONT;
    c7c.alignment = wrapLeftTop;
    // Excel no auto-ajusta filas con celdas mergeadas: altura explícita.
    const contratanteLines = Math.max(1, Math.ceil(contratante.length / 78));
    ws.getRow(7).height = 2.25 + contratanteLines * 13.5;
  }

  // R8 — Titular
  const c8a = ws.getCell('A8');
  c8a.value = 'Nombre del Titular:';
  c8a.font = SMALL_FONT;
  c8a.alignment = { horizontal: 'left', vertical: 'top' };
  const c8c = ws.getCell('C8');
  c8c.value = holder;
  c8c.font = SMALL_FONT;
  c8c.alignment = wrapLeftTop;
  ws.mergeCells('D8:E8');
  const c8d = ws.getCell('D8');
  c8d.value = `Rif ó CI: ${holderCi}`;
  c8d.font = DEFAULT_FONT;
  c8d.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  // R9 — Paciente
  const c9a = ws.getCell('A9');
  c9a.value = 'Nombre del Paciente:';
  c9a.font = SMALL_FONT;
  c9a.alignment = { horizontal: 'left', vertical: 'top' };
  const c9c = ws.getCell('C9');
  c9c.value = patient;
  c9c.font = SMALL_FONT;
  c9c.alignment = wrapLeftTop;
  ws.mergeCells('D9:E9');
  const c9d = ws.getCell('D9');
  c9d.value = `Rif ó CI: ${patientCi}`;
  c9d.font = DEFAULT_FONT;
  c9d.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  // R10 — Clave de Servicio. La factura usa serviceKey tal cual; la 'R' de
  // reembolso (crédito + isReimbursement) es sólo de la orden interna.
  {
    const c10a = ws.getCell('A10');
    c10a.value = 'Clave de Servicio Nº:';
    c10a.font = DEFAULT_FONT;
    c10a.alignment = { horizontal: 'left', vertical: 'middle' };
    const c10c = ws.getCell('C10');
    c10c.value = order.serviceKey ?? '';
    c10c.font = DEFAULT_FONT;
    c10c.alignment = wrapLeft;
  }

  // R11 — Condiciones de pago (con bordes, columnas D y E como tabla)
  ws.getRow(11).height = 22.5;
  const c11d = ws.getCell('D11');
  c11d.value = 'CONDICIONES DE PAGO';
  c11d.font = { name: 'Calibri', size: 8, bold: true };
  c11d.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c11d.border = thinBorder();
  const c11e = ws.getCell('E11');
  c11e.value = condicionesPago;
  c11e.font = DEFAULT_FONT;
  c11e.alignment = { horizontal: 'center', vertical: 'middle' };
  c11e.border = thinBorder();

  // R12 — Header tabla
  ws.getRow(12).height = 22.5;
  const headerRow = ws.getRow(12);
  const headers = ['CANTIDAD', 'N° ORDEN', 'DETALLE DE  SERVICIOS', 'P. U Bs.', 'TOTAL Bs.'];
  for (let c = 1; c <= 5; c++) {
    const cell = headerRow.getCell(c);
    cell.value = headers[c - 1];
    cell.font = c === 2 ? { name: 'Calibri', size: 8, bold: true } : BOLD_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: c === 2 };
    cell.border = thinBorder();
  }

  // R13..R13+N-1 — Una fila por Tipo de Servicio con su precio en Bs
  const cobroKind: 'insurance' | 'particular' =
    order.type === 'insurance' ? 'insurance' : 'particular';
  const priceFxForSt = (serviceTypeId: string): number => {
    const snap = (order.servicePricing ?? []).find(
      (p) => p.serviceTypeId === serviceTypeId && p.kind === cobroKind,
    );
    if (!snap) return 0;
    return Number(snap.priceUsd) || 0;
  };
  const stsRaw = (order.orderServiceTypes ?? []).filter(
    (row) => !!row.serviceTypeId,
  );
  const detailRows: Array<{
    name: string;
    qty: number;
    unitBs: number;
    totalRowBs: number;
    orderNo: string;
  }> =
    stsRaw.length > 0
      ? stsRaw.map((row) => {
          const fx = priceFxForSt(row.serviceTypeId);
          const unitBs = rateBs > 0 ? fx * rateBs : fx;
          const qty = Math.max(1, Math.trunc(row.quantity ?? 1));
          const pid =
            row.providerType === 'doctor' ? row.doctorId : row.careCenterId;
          return {
            name: row.customName?.trim() || row.serviceType?.name || '',
            qty,
            unitBs,
            totalRowBs: unitBs * qty,
            // N° de orden interna del proveedor de ESTA fila (no el base).
            orderNo:
              row.internalOrder?.internalNumber ??
              providerInternalNumber(order, row.providerType, pid ?? ''),
          };
        })
      : [{ name: '', qty: 1, unitBs: priceBs, totalRowBs: priceBs, orderNo: order.orderNumber }];
  const sumStsBs = detailRows.reduce((acc, r) => acc + r.totalRowBs, 0);
  const totalBs = sumStsBs > 0 ? sumStsBs : priceBs;
  const totalFx = rateBs > 0 ? totalBs / rateBs : priceFx;
  const detailStart = 13;
  detailRows.forEach((row, i) => {
    const r = ws.getRow(detailStart + i);
    r.getCell(1).value = String(row.qty).padStart(2, '0');
    r.getCell(2).value = row.orderNo;
    r.getCell(3).value = row.name;
    r.getCell(4).value = row.unitBs;
    r.getCell(4).numFmt = '#,##0.00';
    r.getCell(5).value = row.totalRowBs;
    r.getCell(5).numFmt = '#,##0.00';
    for (let c = 1; c <= 5; c++) {
      const cell = r.getCell(c);
      cell.font = DEFAULT_FONT;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: c === 3 };
      cell.border = thinBorder();
    }
  });

  // Totales — posición dinámica
  const subtotalRow = detailStart + detailRows.length + 1; // +1 spacer

  // SUB-TOTAL
  let rc = ws.getCell(`C${subtotalRow}`);
  rc.value = 'SUB-TOTAL';
  rc.font = DEFAULT_FONT;
  rc.alignment = { horizontal: 'right' };
  let rd = ws.getCell(`D${subtotalRow}`);
  rd.value = 'Bs';
  rd.font = DEFAULT_FONT;
  rd.alignment = { horizontal: 'right' };
  let re = ws.getCell(`E${subtotalRow}`);
  re.value = totalBs;
  re.numFmt = '#,##0.00';
  re.font = DEFAULT_FONT;
  re.alignment = { horizontal: 'center' };

  // EXENTO
  const exentoRow = subtotalRow + 1;
  rc = ws.getCell(`C${exentoRow}`);
  rc.value = 'EXENTO';
  rc.font = DEFAULT_FONT;
  rc.alignment = { horizontal: 'right' };
  rd = ws.getCell(`D${exentoRow}`);
  rd.value = 'Bs';
  rd.font = DEFAULT_FONT;
  rd.alignment = { horizontal: 'right' };
  re = ws.getCell(`E${exentoRow}`);
  re.value = totalBs;
  re.numFmt = '#,##0.00';
  re.font = DEFAULT_FONT;
  re.alignment = { horizontal: 'center' };

  // EQUIVALENCIA + BASE IMPONIBLE
  const equivRow = exentoRow + 1;
  let ra = ws.getCell(`A${equivRow}`);
  ra.value = `EQUIVALENCIA : ${currencySymbol}`;
  ra.font = DEFAULT_FONT;
  let rb = ws.getCell(`B${equivRow}`);
  rb.value = totalFx;
  rb.numFmt = '#,##0.00';
  rb.font = DEFAULT_FONT;
  rb.alignment = { horizontal: 'center' };
  rc = ws.getCell(`C${equivRow}`);
  rc.value = 'BASE IMPONIBLE';
  rc.font = DEFAULT_FONT;
  rc.alignment = { horizontal: 'right' };
  rd = ws.getCell(`D${equivRow}`);
  rd.value = 'Bs';
  rd.font = DEFAULT_FONT;
  rd.alignment = { horizontal: 'right' };
  re = ws.getCell(`E${equivRow}`);
  re.value = totalBs;
  re.numFmt = '#,##0.00';
  re.font = DEFAULT_FONT;
  re.alignment = { horizontal: 'center' };

  // Tasa de cambio + IVA. Seguro no indexado (useFixedRate, tasa fija de la
  // orden): la factura NO muestra la tasa usada.
  const tasaRow = equivRow + 1;
  if (!order.useFixedRate) {
    ra = ws.getCell(`A${tasaRow}`);
    ra.value = 'Tasa de cambio BCV :  ';
    ra.font = DEFAULT_FONT;
    rb = ws.getCell(`B${tasaRow}`);
    rb.value = rateBs;
    rb.numFmt = '#,##0.00';
    rb.font = DEFAULT_FONT;
    rb.alignment = { horizontal: 'center' };
  }
  rc = ws.getCell(`C${tasaRow}`);
  rc.value = 'IVA %  ( E )';
  rc.font = DEFAULT_FONT;
  rc.alignment = { horizontal: 'right' };
  rd = ws.getCell(`D${tasaRow}`);
  rd.value = 'Bs';
  rd.font = DEFAULT_FONT;
  rd.alignment = { horizontal: 'right' };
  re = ws.getCell(`E${tasaRow}`);
  re.value = 0;
  re.numFmt = '#,##0.00';
  re.font = DEFAULT_FONT;
  re.alignment = { horizontal: 'center' };

  // TOTAL A PAGAR
  const totalRow = tasaRow + 1;
  rc = ws.getCell(`C${totalRow}`);
  rc.value = 'TOTAL A PAGAR ';
  rc.font = DEFAULT_FONT;
  rc.alignment = { horizontal: 'right' };
  rd = ws.getCell(`D${totalRow}`);
  rd.value = 'Bs';
  rd.font = DEFAULT_FONT;
  rd.alignment = { horizontal: 'right' };
  re = ws.getCell(`E${totalRow}`);
  re.value = totalBs;
  re.numFmt = '#,##0.00';
  re.font = DEFAULT_FONT;
  re.alignment = { horizontal: 'center' };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Facturacion-${order.orderNumber}.xlsx`,
  );
}

/**
 * Genera 1 XLSX de "Orden interna" para UN proveedor de la orden. Layout,
 * dimensiones, bordes y estilos calcan el template `Orden interna.xlsx` de AFMI:
 * rejilla negra completa (recuadros FECHA/N° + bloque de datos A5:G14 con sus
 * acentos en línea media), RIF en azul corporativo y anchos uniformes del
 * original (sin <cols> propios). Fuentes/estilos = índices del styles.xml.
 */
export async function downloadOrdenInternaForProvider(
  order: Order,
  group: OrderProviderGroup,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('ORDENES INTERNAS', {
    properties: { defaultRowHeight: 15 },
  });

  // Anchos por columna — dan aire a etiquetas/valores de la derecha
  // (Especialidad / Teléfono / Referencia / Clave de Servicio) y evitan que
  // partan en 2 líneas o se recorten.
  ws.columns = [
    { width: 12 }, // A — etiquetas izquierda
    { width: 9 }, // B
    { width: 11 }, // C — valores
    { width: 11 }, // D — etiqueta "Teléfono:"
    { width: 12 }, // E — teléfono
    { width: 19 }, // F — etiquetas derecha (cabe "Clave de Servicio:")
    { width: 13 }, // G — valores derecha
  ];

  // Logo AFMI — tamaño absoluto del template (1247775×409575 EMU = 131×43 px),
  // anclado a A1 (oneCell: se mueve con la celda, no se redimensiona).
  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 131, height: 43 },
    } as ExcelJS.ImagePosition);
  }

  // ---- Fuentes (espejan los índices de fonts del styles.xml del template) ----
  const F12: Partial<ExcelJS.Font> = { name: 'Calibri', size: 12 };
  const RIF_BLUE: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 9,
    bold: true,
    color: { argb: 'FF002060' },
  };
  const C11: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 };
  const C11B: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true };
  const C10: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10 };
  const C10B: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 10,
    bold: true,
    color: { argb: 'FF000000' },
  };
  const C9B: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9, bold: true };
  const C8: Partial<ExcelJS.Font> = { name: 'Calibri', size: 8 };
  const C8B: Partial<ExcelJS.Font> = { name: 'Calibri', size: 8, bold: true };

  // ---- Bordes negros (líneas de las celdas del template) ----
  const BLACK = { argb: 'FF000000' };
  const T: Partial<ExcelJS.Border> = { style: 'thin', color: BLACK };
  const box: Partial<ExcelJS.Borders> = { top: T, bottom: T, left: T, right: T };
  /**
   * Recuadro fino negro en toda una fila A..G (o sub-rango). En celdas
   * mergeadas, ExcelJS pinta correctamente el perímetro exterior y descarta las
   * líneas interiores (Excel no las dibuja), por lo que aplicar el recuadro a
   * cada celda del merge equivale visualmente a las líneas del template.
   */
  const boxRow = (rowNum: number, from = 1, to = 7): void => {
    for (let c = from; c <= to; c++) ws.getCell(rowNum, c).border = { ...box };
  };

  // ---- Alineaciones ----
  const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
  const centerWrap: Partial<ExcelJS.Alignment> = { ...center, wrapText: true };
  const leftMid: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle' };

  /** Escribe valor + estilo en una celda de forma compacta. */
  const put = (
    addr: string,
    value: ExcelJS.CellValue,
    font: Partial<ExcelJS.Font>,
    align?: Partial<ExcelJS.Alignment>,
    numFmt?: string,
  ): ExcelJS.Cell => {
    const c = ws.getCell(addr);
    c.value = value;
    c.font = font;
    if (align) c.alignment = align;
    if (numFmt) c.numFmt = numFmt;
    return c;
  };

  // ---- Alturas de fila del template ----
  ws.getRow(2).height = 15.75;
  ws.getRow(3).height = 15.75;
  ws.getRow(5).height = 30;
  ws.getRow(9).height = 30;
  ws.getRow(12).height = 15.75;

  // ---- Merges del template (cabecera + bloque de datos) ----
  ws.mergeCells('C2:E2');
  ws.mergeCells('A3:B3');
  ws.mergeCells('C3:E3');
  ws.mergeCells('A5:B5'); // Médico Tratante/Centro (etiqueta)
  ws.mergeCells('C5:E5'); // Médico Tratante/Centro (valor)
  ws.mergeCells('A6:B6');
  ws.mergeCells('C6:G6');
  ws.mergeCells('A7:B7'); // Titular (etiqueta)
  ws.mergeCells('C7:E7'); // Titular (valor)
  ws.mergeCells('A8:B8'); // Paciente (etiqueta)
  ws.mergeCells('C8:E8'); // Paciente (valor)
  ws.mergeCells('B9:C9'); // Edad (valor)
  ws.mergeCells('B10:G10'); // Dirección (valor)
  ws.mergeCells('B11:E11'); // Patología (valor)
  ws.mergeCells('A12:G12'); // Header tabla

  // ====== Cabecera ======
  // R2 — Título central + recuadro FECHA (F2:G2)
  put('C2', 'ORDEN INTERNA SERVICIOS', F12, center);
  put('F2', 'FECHA', F12, center);
  put('G2', fmtDate(order.orderDate), F12, center, '@');
  boxRow(2, 6, 7);

  // R3 — RIF (azul) + Razón Social AFMI + recuadro N° (F3:G3)
  put('A3', `      RIF ${COMPANY.rif}`, RIF_BLUE, { horizontal: 'center', wrapText: true });
  put('C3', COMPANY.name, F12, center);
  put('F3', 'N°', F12, center);
  // N° de orden interna de ESTE proveedor (cada orden interna su propio número).
  put('G3', group.providerOrderNumber, F12, center, '@');
  boxRow(3, 6, 7);

  // ====== Bloque de datos (rejilla negra A5:G14) ======
  // R5 — Médico Tratante/Centro + Especialidad
  put('A5', group.providerType === 'doctor' ? 'Médico Tratante:' : 'Centro:', C11, leftMid);
  put('C5', group.providerName.toUpperCase(), C10, { horizontal: 'left', vertical: 'middle', wrapText: true });
  put('F5', 'Especialidad:', C11, leftMid);
  // Especialidad de ESTE proveedor (no la principal de la orden).
  put('G5', groupSpecialtyLabel(group), C8, centerWrap);
  boxRow(5);

  // R6 — Centro/Dirección del proveedor (doctor o centro). C6:G6 mergeado.
  put('A6', 'Centro/Dirección: ', C11, leftMid);
  put('C6', group.providerCenterAddress, C11, { ...leftMid, wrapText: true });
  boxRow(6);

  // R7 — Titular + Rif ó CI (el titular puede ser jurídico → RIF)
  put('A7', 'Titular', C11, leftMid);
  put('C7', holderDisplayName(order.holder), C11, { horizontal: 'left', vertical: 'middle' });
  put('F7', 'Rif ó CI:', C11, leftMid);
  put('G7', holderId(order.holder), C11, center);
  boxRow(7);

  // R8 — Paciente + Cédula
  put('A8', 'Paciente', C11, leftMid);
  put('C8', holderDisplayName(order.patient), C11, { horizontal: 'left', vertical: 'middle' });
  put('F8', 'Cédula:', C11, leftMid);
  put('G8', holderId(order.patient), C11, center);
  boxRow(8);

  // R9 — Edad + Teléfono + Referencia
  const age = ageFromBirthDate(order.patient?.birthDate);
  const phone = order.patient?.phones?.[0]?.number ?? '';
  put('A9', 'Edad: ', C11B, leftMid);
  // Edad puede ser texto ("3 meses" para bebés) o años numéricos.
  put('B9', /^\d+$/.test(age) ? Number(age) : age, C11, center);
  put('D9', 'Teléfono:', C11B, leftMid);
  put('E9', phone, C11, { horizontal: 'left', vertical: 'middle' }, '@');
  put('F9', 'Referencia:', C11B, leftMid);
  put('G9', orderReferenceLabel(order), C11, center);
  boxRow(9);

  // R10 — Dirección (B10:G10 mergeado)
  put('A10', 'Dirección: ', C11, leftMid);
  put('B10', order.patient?.address ?? '', C11, { horizontal: 'left', vertical: 'middle' });
  boxRow(10);

  // R11 — Patología + Clave de Servicio. Valor mergeado B11:E11.
  const pathologyText = (order.pathologies ?? [])
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ');
  put('A11', 'Patología:', C11, { vertical: 'middle', wrapText: true });
  put('B11', pathologyText, C11, { horizontal: 'left', vertical: 'middle', wrapText: true });
  put('F11', 'Clave de Servicio:', C11, leftMid);
  // Clave de servicio: seguro la captura en el Paso 1; crédito-reembolso → "R".
  put('G11', orderServiceKeyDisplay(order), C11, center);
  boxRow(11);
  // Excel no auto-ajusta filas con celdas mergeadas: altura explícita.
  // Merge B:E ≈ 4 cols × 10.71 ≈ 40 chars en Calibri 11.
  const pathologyLines = Math.max(1, Math.ceil(pathologyText.length / 40));
  ws.getRow(11).height = Math.max(15, pathologyLines * 15);

  // R12 — Header tabla "Tipos de Servicios" (A12:G12 mergeado)
  put('A12', 'Tipos de Servicios', F12, center);
  boxRow(12);

  // ====== Tabla de servicios — mín. 2 filas, 2 STs por fila (A:D y E:G) ======
  const sts = group.rows.map((row) => {
    const base =
      row.customName?.trim() || row.serviceType?.name || row.serviceTypeId;
    return row.quantity && row.quantity > 1 ? `${base} (x${row.quantity})` : base;
  });
  const svcAlign: Partial<ExcelJS.Alignment> = {
    horizontal: 'left',
    vertical: 'top',
    wrapText: true,
  };
  const tableStart = 13;
  const tableRows = Math.max(2, Math.ceil(sts.length / 2));
  for (let i = 0; i < tableRows; i++) {
    const r = tableStart + i;
    ws.mergeCells(`A${r}:D${r}`);
    ws.mergeCells(`E${r}:G${r}`);
    put(`A${r}`, sts[i * 2] ?? '', C11, svcAlign);
    put(`E${r}`, sts[i * 2 + 1] ?? '', C11, svcAlign);
    boxRow(r);
  }
  const tableEnd = tableStart + tableRows - 1;

  // ====== Footer empresa — centrado (A:G), sin bordes, con fila de aire ======
  const f1 = tableEnd + 2; // tableEnd+1 = fila en blanco de separación
  const footerLines = [
    { text: `Dirección: ${COMPANY.domicilio}`, font: C9B },
    { text: `${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`, font: C8B },
    { text: `Correo electrónico: ${COMPANY.email}`, font: C8B },
  ];
  footerLines.forEach((l, i) => {
    const r = f1 + i;
    ws.mergeCells(`A${r}:G${r}`);
    put(`A${r}`, l.text, l.font, center);
  });

  // ====== Firma — usuario creador, centrada (A:G) con aire arriba ======
  const cb = order.createdBy;
  const fullName = cb
    ? [cb.academicDegree?.trim(), cb.firstName?.trim(), cb.lastName?.trim()]
        .filter(Boolean)
        .join(' ')
    : '';
  const jobTitle = cb?.jobTitle?.trim() ?? '';
  const sigRow = f1 + footerLines.length + 1; // +1 fila en blanco
  ws.mergeCells(`A${sigRow}:G${sigRow}`);
  ws.mergeCells(`A${sigRow + 1}:G${sigRow + 1}`);
  put(`A${sigRow}`, fullName, C10B, center);
  put(`A${sigRow + 1}`, jobTitle, C10B, center);

  const buf = await wb.xlsx.writeBuffer();
  const providerSlug = safeFilenameSegment(group.providerName);
  const typeSlug = group.providerType === 'doctor' ? 'doctor' : 'centro';
  saveAs(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Orden-${group.providerOrderNumber}-${typeSlug}-${providerSlug}.xlsx`,
  );
}

/** Descarga 1 XLSX por cada proveedor distinto de la orden. */
export async function downloadOrdenInternaForAllProviders(order: Order): Promise<void> {
  for (const group of groupOrderProviders(order)) {
    await downloadOrdenInternaForProvider(order, group);
  }
}
