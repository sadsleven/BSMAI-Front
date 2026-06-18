import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import type { Order } from '../../domain/models/order';
import { holderDisplayName } from '../../domain/models/order';
import {
  orderReferenceLabel,
  providerInternalNumber,
  resolveCreationRateBs,
  type OrderProviderGroup,
} from './orderExcel';
import { formatMoney } from '@/lib/format/money';

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

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-VE');
}

function safeFilenameSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 80) || 'sin_nombre';
}

function ageFromBirthDate(iso?: string | null): string {
  if (!iso) return '';
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 150 ? String(age) : '';
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
            name: row.serviceType?.name ?? '',
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

  // Anchos proporcionales al Excel (cols 17.57/6.14/39/10.57/12.86 → 86.14 total)
  // Página A4 útil ≈ 182mm. Mapeo a mm.
  const colW = {
    0: 37.0,
    1: 13.0,
    2: 82.0,
    3: 22.2,
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

  // R3 — Fecha de emisión
  body.push([
    '',
    '',
    '',
    { content: 'Fecha de Emisión:', styles: { halign: 'right' } },
    { content: fmtDate(order.orderDate), styles: { halign: 'center', fontSize: 8 } },
  ]);

  if (isInsurance) {
    // R4 — Razón social
    body.push([
      'Nombre  o Razón Social :',
      '',
      order.insurance?.name ?? '',
      '',
      '',
    ]);
    // R5 — Dirección fiscal (valor abarca C:E)
    body.push([
      'Dirección Fiscal :',
      '',
      { content: order.insurance?.fiscalAddress ?? '', colSpan: 3 },
    ]);
    // R6 — RIF + Teléfono (teléfono abarca D:E)
    body.push([
      'Rif ó CI:',
      '',
      order.insurance?.rif ?? '',
      {
        content: insurancePhone ? `Teléfono:(${insurancePhone})` : 'Teléfono:',
        colSpan: 2,
        styles: { fontSize: 8 },
      },
    ]);
    // R7 — Contratante. Seguro directo al paciente → el titular.
    body.push([
      'Contratante:',
      '',
      {
        content:
          order.insuranceSource === 'direct' ? holder : order.contractor?.name ?? '',
        styles: { fontSize: 8 },
      },
      '',
      '',
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

  if (isInsurance) {
    // R10 — Clave de servicio
    body.push([
      'Clave de Servicio Nº:',
      '',
      order.serviceKey ?? '',
      '',
      '',
    ]);
  }

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
  // R18 — Tasa de cambio + IVA
  body.push([
    'Tasa de cambio BCV :  ',
    { content: fmtMoney(rateBs), styles: { halign: 'center' } },
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
    startY: 14,
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0,
      valign: 'middle',
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

  // Logo AFMI top-left
  const logoUrl = await loadLogoDataUrl();
  if (logoUrl) {
    // 304x90 px aprox → 46mm x 13.6mm
    doc.addImage(logoUrl, 'PNG', 14, 14, 46, 13.6);
  }

  // Anchos cols proporcionales al Excel (12/12/14/14/14/14/14 → 94 total → 182mm)
  const colW = {
    0: 23.0,
    1: 23.0,
    2: 27.0,
    3: 27.0,
    4: 27.0,
    5: 27.0,
    6: 27.0,
  };

  const age = ageFromBirthDate(order.patient?.birthDate);
  const phone = order.patient?.phones?.[0]?.number ?? '';
  const patient = holderDisplayName(order.patient);
  const patientCi = holderId(order.patient);
  const providerLabel =
    group.providerType === 'doctor' ? 'Médico Tratante:' : 'Centro:';
  const centerAddress = group.providerCenterAddress;
  const sts = group.rows.map((r) => {
    const base = r.serviceType?.name ?? r.serviceTypeId;
    return r.quantity && r.quantity > 1 ? `${base} (x${r.quantity})` : base;
  });

  type Cell =
    | string
    | {
        content: string;
        styles?: Record<string, unknown>;
        colSpan?: number;
        rowSpan?: number;
      };

  const empty7: Cell[] = ['', '', '', '', '', '', ''];

  const body: Cell[][] = [];

  // R1 — zona logo (vacía, logo overlay)
  body.push(empty7);

  // R2 — Título central + Fecha
  body.push([
    '',
    '',
    {
      content: 'ORDEN INTERNA SERVICIOS',
      colSpan: 3,
      styles: { halign: 'center', valign: 'middle', fontSize: 12 },
    },
    { content: 'FECHA', styles: { halign: 'center', fontSize: 12 } },
    { content: fmtDate(order.orderDate), styles: { halign: 'center', fontSize: 12 } },
  ]);

  // R3 — RIF + AFMI + N°
  body.push([
    {
      content: `RIF ${COMPANY.rif}`,
      colSpan: 2,
      styles: { halign: 'center', fontStyle: 'bold', fontSize: 9 },
    },
    {
      content: COMPANY.name,
      colSpan: 3,
      styles: { halign: 'center', fontSize: 12 },
    },
    { content: 'N°', styles: { halign: 'center', fontSize: 12 } },
    { content: group.providerOrderNumber, styles: { halign: 'center', fontSize: 12 } },
  ]);

  // R5 — Médico Tratante/Centro + Especialidad
  body.push([
    { content: providerLabel, styles: { fontSize: 11 } },
    '',
    {
      content: group.providerName.toUpperCase(),
      colSpan: 3,
      styles: { halign: 'center', valign: 'middle', fontSize: 10 },
    },
    { content: 'Especialidad:', styles: { fontSize: 11 } },
    {
      content: (order.specialty?.name ?? '').toUpperCase(),
      styles: { halign: 'center', valign: 'middle', fontSize: 8 },
    },
  ]);

  // R6 — Centro/Dirección
  body.push([
    { content: 'Centro/Dirección:', colSpan: 2, styles: { fontSize: 11 } },
    { content: centerAddress, colSpan: 5, styles: { halign: 'left', fontSize: 11 } },
  ]);

  // R7 — Paciente + Cédula
  body.push([
    { content: 'Paciente', colSpan: 2, styles: { halign: 'left', fontSize: 11 } },
    {
      content: patient,
      colSpan: 3,
      styles: { halign: 'left', fontSize: 11 },
    },
    { content: 'Cédula:', styles: { fontSize: 11 } },
    {
      content: patientCi,
      styles: { halign: 'center', valign: 'top', fontSize: 11 },
    },
  ]);

  // R8 — Edad + Teléfono + Referencia
  body.push([
    { content: 'Edad:', styles: { fontStyle: 'bold', fontSize: 11 } },
    {
      content: age,
      colSpan: 2,
      styles: { halign: 'center', fontSize: 11 },
    },
    { content: 'Teléfono:', styles: { fontStyle: 'bold', fontSize: 11 } },
    { content: phone, styles: { fontSize: 11 } },
    { content: 'Referencia:', styles: { fontStyle: 'bold', fontSize: 11 } },
    {
      content: orderReferenceLabel(order),
      styles: { halign: 'center', fontSize: 11 },
    },
  ]);

  // R9 — Dirección
  body.push([
    { content: 'Dirección:', styles: { fontSize: 11 } },
    {
      content: order.patient?.address ?? '',
      colSpan: 6,
      styles: { halign: 'left', fontSize: 11 },
    },
  ]);

  // R10 — Patología + Clave de Servicio
  const pathologyText = (order.pathologies ?? [])
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ');
  body.push([
    { content: 'Patología:', styles: { fontSize: 11 } },
    {
      content: pathologyText,
      colSpan: 4,
      styles: { halign: 'left', fontSize: 11 },
    },
    { content: 'Clave de Servicio:', styles: { fontSize: 11 } },
    {
      // Clave de servicio = la capturada en el Paso 1 (sólo seguro la persiste).
      content: order.serviceKey ?? '',
      styles: { halign: 'center', fontSize: 11 },
    },
  ]);

  // R11 — Header tabla "Tipos de Servicios"
  const tiposHeaderIdx = body.length;
  body.push([
    {
      content: 'Tipos de Servicios',
      colSpan: 7,
      styles: { halign: 'center', fontSize: 12 },
    },
  ]);

  // R12+ — STs 2 por fila (A:D + E:G)
  for (let i = 0; i < sts.length; i += 2) {
    body.push([
      {
        content: sts[i] ?? '',
        colSpan: 4,
        styles: { halign: 'left', valign: 'top', fontSize: 11 },
      },
      {
        content: sts[i + 1] ?? '',
        colSpan: 3,
        styles: { halign: 'left', valign: 'top', fontSize: 11 },
      },
    ]);
  }
  if (sts.length === 0) body.push(empty7);
  const tiposEnd = body.length;

  autoTable(doc, {
    startY: 14,
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 11,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0,
      valign: 'middle',
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
      // Bordes en header tabla + filas STs
      if (data.row.index >= tiposHeaderIdx && data.row.index < tiposEnd) {
        data.cell.styles.lineWidth = 0.2;
        data.cell.styles.lineColor = [0, 0, 0];
      }
    },
  });

  // @ts-expect-error lastAutoTable runtime
  let y = doc.lastAutoTable.finalY + 6;

  // Footer empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Dirección:   ${COMPANY.domicilio}`, doc.internal.pageSize.getWidth() / 2, y, {
    align: 'center',
  });
  y += 4;
  doc.setFontSize(8);
  doc.text(
    `${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`,
    doc.internal.pageSize.getWidth() / 2,
    y,
    { align: 'center' },
  );
  y += 4;
  doc.text(
    `Correo electrónico: ${COMPANY.email}`,
    doc.internal.pageSize.getWidth() / 2,
    y,
    { align: 'center' },
  );
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
  doc.text(fullName, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 4;
  doc.text(jobTitle, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

  const providerSlug = safeFilenameSegment(group.providerName);
  const typeSlug = group.providerType === 'doctor' ? 'doctor' : 'centro';
  const blob = doc.output('blob');
  saveAs(blob, `Orden-${group.providerOrderNumber}-${typeSlug}-${providerSlug}.pdf`);
}
