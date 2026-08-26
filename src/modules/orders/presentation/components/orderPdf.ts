import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import type { Order } from '../../domain/models/order';
import {
  holderDisplayName,
  orderInvoiceDate,
  orderServiceKeyDisplay,
} from '../../domain/models/order';
import {
  orderReferenceLabel,
  providerInternalNumber,
  resolveCreationRateBs,
  type OrderProviderGroup,
} from './orderExcel';
import { formatMoney } from '@/lib/format/money';
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

function safeFilenameSegment(s: string): string {
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

/** Carga logo AFMI desde public/ como dataURL. Null si falla. */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const url = `${import.meta.env.BASE_URL}excel-image.png`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Facturación: PDF con mismo layout que el Excel. */
export async function downloadFacturacionPdf(order: Order): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const isInsurance = order.type === 'insurance';
  const insurancePhone = order.insurance?.phones?.[0]?.number ?? '';
  const holder = holderDisplayName(order.holder);
  const patient = holderDisplayName(order.patient);
  const holderCi = holderId(order.holder);
  const patientCi = holderId(order.patient);
  const condicionesPago = order.type === 'cash' ? 'CONTADO' : 'CREDITO';

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

  // Conversión a Bs vía tasa más reciente vigente al crear la orden
  const rateBs = await resolveCreationRateBs(order);
  const priceFx = Number(order.priceAmount) || 0;
  const priceBs = rateBs > 0 ? priceFx * rateBs : priceFx;
  const currencySymbol = '$';

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
  const detailRowsList: Array<{
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
            orderNo:
              row.internalOrder?.internalNumber ??
              providerInternalNumber(order, row.providerType, pid ?? ''),
          };
        })
      : [{ name: '', qty: 1, unitBs: priceBs, totalRowBs: priceBs, orderNo: order.orderNumber }];
  const sumStsBs = detailRowsList.reduce((acc, r) => acc + r.totalRowBs, 0);
  const totalBs = sumStsBs > 0 ? sumStsBs : priceBs;
  const totalFx = rateBs > 0 ? totalBs / rateBs : priceFx;

  const fmtMoney = (n: number): string => formatMoney(n);

  // Anchos (mm). col0 ancho para que "Nombre o Razón Social :" no parta en 2
  // líneas; resto calca las proporciones del Excel.
  const colW = {
    0: 42.0,
    1: 13.0,
    2: 70.0,
    3: 22.0,
    4: 27.0,
  };

  type Row = (
    | string
    | {
        content: string;
        styles?: Record<string, unknown>;
        colSpan?: number;
      }
  )[];
  const body: Row[] = [];
  const HEADER_ROW_IDX = (): number => body.length;

  // R3 — Fecha de emisión (etiqueta abarca C:D para no partir en 2 líneas)
  body.push([
    '',
    '',
    { content: 'Fecha de Emisión:', colSpan: 2, styles: { halign: 'right' } },
    {
      content: fmtDate(orderInvoiceDate(order)),
      styles: { halign: 'center', fontSize: 9 },
    },
  ]);

  // R4-R7 — Contratante. Seguro → datos del seguro; resto → titular.
  {
    // R4 — Razón social (valor abarca C:E)
    body.push([
      'Nombre  o Razón Social :',
      '',
      { content: contratanteName, colSpan: 3 },
    ]);
    // R5 — Dirección fiscal (valor abarca C:E)
    body.push([
      'Dirección Fiscal :',
      '',
      { content: contratanteAddress, colSpan: 3 },
    ]);
    // R6 — RIF + Teléfono (teléfono abarca D:E)
    body.push([
      'Rif ó CI:',
      '',
      contratanteRif,
      {
        content: contratantePhone ? `Teléfono:(${contratantePhone})` : 'Teléfono:',
        colSpan: 2,
        styles: { fontSize: 8 },
      },
    ]);
    // R7 — Contratante (valor abarca C:E). Seguro directo al paciente / no
    // seguro → el titular.
    body.push([
      'Contratante:',
      '',
      {
        content: contratante,
        colSpan: 3,
        styles: { fontSize: 8 },
      },
    ]);
  }

  // R8 — Titular (Rif abarca D:E)
  body.push([
    { content: 'Nombre del Titular:', styles: { fontSize: 8 } },
    '',
    { content: holder, styles: { fontSize: 8 } },
    { content: `Rif ó CI: ${holderCi}`, colSpan: 2 },
  ]);
  // R9 — Paciente (Rif abarca D:E)
  body.push([
    { content: 'Nombre del Paciente:', styles: { fontSize: 8 } },
    '',
    { content: patient, styles: { fontSize: 8 } },
    { content: `Rif ó CI: ${patientCi}`, colSpan: 2 },
  ]);

  // R10 — Clave de servicio. La factura usa serviceKey tal cual; la 'R' de
  // reembolso (crédito + isReimbursement) es sólo de la orden interna.
  body.push([
    'Clave de Servicio Nº:',
    '',
    order.serviceKey ?? '',
    '',
    '',
  ]);

  // Espaciador antes de la tabla de detalle (separa datos del recuadro)
  body.push(['', '', '', '', '']);

  // R11 — Condiciones de pago (con bordes en D y E)
  const condRowIdx = HEADER_ROW_IDX();
  body.push([
    '',
    '',
    '',
    {
      content: 'CONDICIONES DE PAGO',
      styles: { halign: 'center', fontSize: 7, fontStyle: 'bold' },
    },
    { content: condicionesPago, styles: { halign: 'center' } },
  ]);

  // R12 — Header tabla detalle (con bordes)
  const tableHeaderIdx = HEADER_ROW_IDX();
  body.push([
    { content: 'CANTIDAD', styles: { halign: 'center', fontStyle: 'bold' } },
    {
      content: 'N° ORDEN',
      styles: { halign: 'center', fontStyle: 'bold', fontSize: 7 },
    },
    { content: 'DETALLE DE  SERVICIOS', styles: { halign: 'center', fontStyle: 'bold' } },
    { content: 'P. U Bs.', styles: { halign: 'center', fontStyle: 'bold' } },
    { content: 'TOTAL Bs.', styles: { halign: 'center', fontStyle: 'bold' } },
  ]);

  // R13+ — Una fila por Tipo de Servicio (con bordes, precio por ST)
  const detailStartIdx = HEADER_ROW_IDX();
  detailRowsList.forEach((row) => {
    body.push([
      { content: String(row.qty).padStart(2, '0'), styles: { halign: 'center' } },
      { content: row.orderNo, styles: { halign: 'center' } },
      { content: row.name, styles: { halign: 'center' } },
      { content: fmtMoney(row.unitBs), styles: { halign: 'center' } },
      { content: fmtMoney(row.totalRowBs), styles: { halign: 'center' } },
    ]);
  });
  const detailEndIdx = HEADER_ROW_IDX();

  // R14 — espaciador
  body.push(['', '', '', '', '']);

  // R15 — Sub-total
  body.push([
    '',
    '',
    { content: 'SUB-TOTAL', styles: { halign: 'right' } },
    { content: 'Bs', styles: { halign: 'right' } },
    { content: fmtMoney(totalBs), styles: { halign: 'center' } },
  ]);
  // R16 — Exento
  body.push([
    '',
    '',
    { content: 'EXENTO', styles: { halign: 'right' } },
    { content: 'Bs', styles: { halign: 'right' } },
    { content: fmtMoney(totalBs), styles: { halign: 'center' } },
  ]);
  // R17 — Equivalencia + Base imponible
  body.push([
    `EQUIVALENCIA : ${currencySymbol}`,
    { content: fmtMoney(totalFx), styles: { halign: 'center' } },
    { content: 'BASE IMPONIBLE', styles: { halign: 'right' } },
    { content: 'Bs', styles: { halign: 'right' } },
    { content: fmtMoney(totalBs), styles: { halign: 'center' } },
  ]);
  // R18 — Tasa de cambio + IVA. Seguro no indexado (useFixedRate, tasa fija de
  // la orden): la factura NO muestra la tasa usada.
  body.push([
    ...(order.useFixedRate
      ? ['', '']
      : [
          'Tasa de cambio BCV :  ',
          { content: fmtMoney(rateBs), styles: { halign: 'center' } },
        ]),
    { content: 'IVA %  ( E )', styles: { halign: 'right' } },
    { content: 'Bs', styles: { halign: 'right' } },
    { content: '0,00', styles: { halign: 'center' } },
  ]);
  // R19 — Total a pagar
  body.push([
    '',
    '',
    { content: 'TOTAL A PAGAR ', styles: { halign: 'right' } },
    { content: 'Bs', styles: { halign: 'right' } },
    { content: fmtMoney(totalBs), styles: { halign: 'center' } },
  ]);

  autoTable(doc, {
    startY: 16,
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 0.7, bottom: 0.7, left: 1.4, right: 1.4 },
      lineColor: [0, 0, 0],
      lineWidth: 0,
      valign: 'middle',
      minCellHeight: 5,
    },
    columnStyles: {
      0: { cellWidth: colW[0] },
      1: { cellWidth: colW[1] },
      2: { cellWidth: colW[2] },
      3: { cellWidth: colW[3] },
      4: { cellWidth: colW[4] },
    },
    didParseCell: (data) => {
      // Bordes en header tabla, todas las filas detalle y celdas condiciones (D y E)
      if (data.row.index === tableHeaderIdx) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      } else if (data.row.index >= detailStartIdx && data.row.index < detailEndIdx) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      } else if (data.row.index === condRowIdx && (data.column.index === 3 || data.column.index === 4)) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      }
    },
  });

  const blob = doc.output('blob');
  saveAs(blob, `Facturacion-${order.orderNumber}.pdf`);
}

/** Orden interna: PDF con mismo layout que el Excel template `Orden interna.xlsx`. */
export async function downloadOrdenInternaPdfForProvider(
  order: Order,
  group: OrderProviderGroup,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();

  // Anchos cols (mm). col5/col6 anchos para que "Clave de Servicio:" y su valor
  // entren en una sola línea, y el teléfono no se parta. Total 172 → centrado.
  const colW: Record<number, number> = {
    0: 22.0,
    1: 14.0,
    2: 20.0,
    3: 20.0,
    4: 24.0,
    5: 35.0,
    6: 37.0,
  };
  const totalW = Object.values(colW).reduce((a, b) => a + b, 0);
  const marginL = (pageW - totalW) / 2;

  const age = ageFromBirthDate(order.patient?.birthDate);
  const phone = order.patient?.phones?.[0]?.number ?? '';
  const holder = holderDisplayName(order.holder);
  const holderCi = holderId(order.holder);
  const patient = holderDisplayName(order.patient);
  const patientCi = holderId(order.patient);
  const providerLabel =
    group.providerType === 'doctor' ? 'Médico Tratante:' : 'Centro:';
  const centerAddress = group.providerCenterAddress;
  const sts = group.rows.map((r) => {
    const base = r.customName?.trim() || r.serviceType?.name || r.serviceTypeId;
    return r.quantity && r.quantity > 1 ? `${base} (x${r.quantity})` : base;
  });

  // RIF azul corporativo (mismo tono que el Excel)
  const RIF_BLUE: [number, number, number] = [0, 32, 96];

  type Cell =
    | string
    | {
        content: string;
        styles?: Record<string, unknown>;
        colSpan?: number;
        rowSpan?: number;
      };

  const body: Cell[][] = [];

  // R1 — fila del logo (izquierda vacía) + recuadro FECHA (cols F:G)
  body.push([
    { content: '', colSpan: 5 },
    { content: 'FECHA', styles: { halign: 'center', fontSize: 11 } },
    { content: fmtDate(order.orderDate), styles: { halign: 'center', fontSize: 11 } },
  ]);

  // R2 — Título central + recuadro N° (cols F:G)
  body.push([
    { content: '', colSpan: 2 },
    {
      content: 'ORDEN INTERNA SERVICIOS',
      colSpan: 3,
      styles: { halign: 'center', valign: 'middle', fontSize: 12 },
    },
    { content: 'N°', styles: { halign: 'center', fontSize: 11 } },
    { content: group.providerOrderNumber, styles: { halign: 'center', fontSize: 11 } },
  ]);

  // R3 — RIF (azul, bajo el logo) + razón social AFMI (centrada como el título)
  body.push([
    {
      content: `RIF ${COMPANY.rif}`,
      colSpan: 2,
      styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, textColor: RIF_BLUE },
    },
    {
      content: COMPANY.name,
      colSpan: 3,
      styles: { halign: 'center', fontSize: 12 },
    },
    { content: '', colSpan: 2 },
  ]);

  // ===== Bloque de datos (rejilla negra completa) =====
  const dataStart = body.length;

  // R5 — Médico Tratante/Centro + Especialidad
  body.push([
    { content: providerLabel, colSpan: 2, styles: { fontSize: 10 } },
    {
      content: group.providerName.toUpperCase(),
      colSpan: 3,
      styles: { halign: 'left', valign: 'middle', fontSize: 10 },
    },
    { content: 'Especialidad:', styles: { fontSize: 10 } },
    {
      content: (order.specialty?.name ?? '').toUpperCase(),
      styles: { halign: 'center', valign: 'middle', fontSize: 9 },
    },
  ]);

  // R6 — Centro/Dirección
  body.push([
    { content: 'Centro/Dirección:', colSpan: 2, styles: { fontSize: 10 } },
    { content: centerAddress, colSpan: 5, styles: { halign: 'left', fontSize: 10 } },
  ]);

  // R7 — Titular + Rif ó CI (el titular puede ser jurídico → RIF)
  body.push([
    { content: 'Titular', colSpan: 2, styles: { halign: 'left', fontSize: 10 } },
    {
      content: holder,
      colSpan: 3,
      styles: { halign: 'left', fontSize: 10 },
    },
    { content: 'Rif ó CI:', styles: { fontSize: 10 } },
    { content: holderCi, styles: { halign: 'center', fontSize: 10 } },
  ]);

  // R8 — Paciente + Cédula
  body.push([
    { content: 'Paciente', colSpan: 2, styles: { halign: 'left', fontSize: 10 } },
    {
      content: patient,
      colSpan: 3,
      styles: { halign: 'left', fontSize: 10 },
    },
    { content: 'Cédula:', styles: { fontSize: 10 } },
    { content: patientCi, styles: { halign: 'center', fontSize: 10 } },
  ]);

  // R9 — Edad + Teléfono + Referencia
  body.push([
    { content: 'Edad:', styles: { fontStyle: 'bold', fontSize: 10 } },
    {
      content: age,
      colSpan: 2,
      styles: { halign: 'center', fontSize: 10 },
    },
    { content: 'Teléfono:', styles: { fontStyle: 'bold', fontSize: 10 } },
    { content: phone, styles: { halign: 'left', fontSize: 10 } },
    { content: 'Referencia:', styles: { fontStyle: 'bold', fontSize: 10 } },
    {
      content: orderReferenceLabel(order),
      styles: { halign: 'center', fontSize: 10 },
    },
  ]);

  // R10 — Dirección
  body.push([
    { content: 'Dirección:', styles: { fontSize: 10 } },
    {
      content: order.patient?.address ?? '',
      colSpan: 6,
      styles: { halign: 'left', fontSize: 10 },
    },
  ]);

  // R11 — Patología + Clave de Servicio
  const pathologyText = (order.pathologies ?? [])
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ');
  body.push([
    { content: 'Patología:', styles: { fontSize: 10 } },
    {
      content: pathologyText,
      colSpan: 4,
      styles: { halign: 'left', fontSize: 10 },
    },
    { content: 'Clave de Servicio:', styles: { fontSize: 10 } },
    {
      // Clave de servicio: seguro la captura en el Paso 1; crédito-reembolso → "R".
      content: orderServiceKeyDisplay(order),
      styles: { halign: 'center', fontSize: 10 },
    },
  ]);

  // R12 — Header tabla "Tipos de Servicios"
  body.push([
    {
      content: 'Tipos de Servicios',
      colSpan: 7,
      styles: { halign: 'center', fontSize: 12 },
    },
  ]);

  // R13+ — STs 2 por fila (A:D + E:G), mínimo 2 filas como el template
  const stRows = Math.max(2, Math.ceil(sts.length / 2));
  for (let i = 0; i < stRows; i++) {
    body.push([
      {
        content: sts[i * 2] ?? '',
        colSpan: 4,
        styles: { halign: 'left', valign: 'top', fontSize: 10 },
      },
      {
        content: sts[i * 2 + 1] ?? '',
        colSpan: 3,
        styles: { halign: 'left', valign: 'top', fontSize: 10 },
      },
    ]);
  }
  const dataEnd = body.length; // exclusivo

  autoTable(doc, {
    startY: 14,
    margin: { left: marginL, right: marginL },
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: { top: 0.8, bottom: 0.8, left: 1.4, right: 1.4 },
      lineColor: [0, 0, 0],
      lineWidth: 0,
      valign: 'middle',
      minCellHeight: 6,
    },
    columnStyles: {
      0: { cellWidth: colW[0] },
      1: { cellWidth: colW[1] },
      2: { cellWidth: colW[2] },
      3: { cellWidth: colW[3] },
      4: { cellWidth: colW[4] },
      5: { cellWidth: colW[5] },
      6: { cellWidth: colW[6] },
    },
    didParseCell: (data) => {
      const i = data.row.index;
      // Recuadro FECHA/N° (filas 0-1, columnas F:G)
      if (
        (i === 0 || i === 1) &&
        (data.column.index === 5 || data.column.index === 6)
      ) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      }
      // Rejilla completa del bloque de datos (R5 → última fila de servicios)
      if (i >= dataStart && i < dataEnd) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      }
    },
  });

  // Logo AFMI — overlay sobre la fila 1 (izquierda; ancho ≤ cols A:B para no
  // pisar el título). Se dibuja tras la tabla para quedar encima.
  const logoUrl = await loadLogoDataUrl();
  if (logoUrl) {
    doc.addImage(logoUrl, 'PNG', marginL, 13.5, 34, 11);
  }

  // @ts-expect-error lastAutoTable runtime
  let y = doc.lastAutoTable.finalY + 7;

  // Footer empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Dirección:   ${COMPANY.domicilio}`, pageW / 2, y, { align: 'center' });
  y += 4.5;
  doc.setFontSize(8);
  doc.text(`${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`, pageW / 2, y, {
    align: 'center',
  });
  y += 4.5;
  doc.text(`Correo electrónico: ${COMPANY.email}`, pageW / 2, y, { align: 'center' });
  y += 14;

  // Firma usuario creador
  const cb = order.createdBy;
  const fullName = cb
    ? [cb.academicDegree?.trim(), cb.firstName?.trim(), cb.lastName?.trim()]
        .filter(Boolean)
        .join(' ')
    : '';
  const jobTitle = cb?.jobTitle?.trim() ?? '';
  doc.setFontSize(10);
  doc.text(fullName, pageW / 2, y, { align: 'center' });
  y += 4.5;
  doc.text(jobTitle, pageW / 2, y, { align: 'center' });

  const providerSlug = safeFilenameSegment(group.providerName);
  const typeSlug = group.providerType === 'doctor' ? 'doctor' : 'centro';
  const blob = doc.output('blob');
  saveAs(blob, `Orden-${group.providerOrderNumber}-${typeSlug}-${providerSlug}.pdf`);
}
