import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import type { Order } from '../../domain/models/order';
import { holderDisplayName } from '../../domain/models/order';
import type { OrderProviderGroup } from './orderExcel';

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

/** Facturación: PDF con mismos datos que el Excel. */
export async function downloadFacturacionPdf(order: Order): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FACTURACIÓN', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`RIF ${COMPANY.rif}`, 14, y);
  doc.text(COMPANY.name, 60, y);
  doc.text(`FECHA: ${fmtDate(order.orderDate)}`, pageW - 14, y, { align: 'right' });
  y += 8;

  const insurance = order.insurance?.name ?? '';
  const contractor = order.contractor?.name ?? '';
  const holder = holderDisplayName(order.holder);
  const patient = holderDisplayName(order.patient);
  const holderCi = holderId(order.holder);
  const patientCi = holderId(order.patient);

  const infoRows: [string, string][] = [
    ['RAZÓN SOCIAL', insurance],
    ['CONTRATANTE', contractor],
    ['NOMBRE DEL TITULAR', `${holder}${holderCi ? `   CI: ${holderCi}` : ''}`],
    ['NOMBRE DEL PACIENTE', `${patient}${patientCi ? `   CI: ${patientCi}` : ''}`],
    ['CLAVE DE SERVICIO', order.orderNumber],
    ['CONDICIONES DE PAGO', order.type.toUpperCase()],
  ];
  autoTable(doc, {
    startY: y,
    head: [],
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });
  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 4;

  const stNames = (order.orderServiceTypes ?? [])
    .map((row) => row.serviceType?.name)
    .filter((n): n is string => !!n)
    .join(', ');
  const pathNames = (order.pathologies ?? []).map((p) => p.name).join(', ');
  const detail = [order.specialty?.name, stNames, pathNames]
    .filter((v) => !!v && v.length > 0)
    .join(' · ');

  const currencySymbol = order.priceCurrency === 'USD' ? '$' : '€';
  const total = Number(order.priceAmount).toFixed(2);

  autoTable(doc, {
    startY: y,
    head: [['CANT.', 'N° ORDEN', 'DETALLE DE SERVICIOS', 'P. U.', 'TOTAL']],
    body: [['01', order.orderNumber, detail, `${currencySymbol} ${total}`, `${currencySymbol} ${total}`]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      1: { halign: 'center', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
    },
  });
  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ['SUB-TOTAL', `${currencySymbol} ${total}`],
      ['EXENTO', `${currencySymbol} ${total}`],
      ['BASE IMPONIBLE', `${currencySymbol} ${total}`],
      ['IVA % (E)', `${currencySymbol} 0.00`],
      ['TOTAL A PAGAR', `${currencySymbol} ${total}`],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60, halign: 'right' },
      1: { halign: 'right' },
    },
  });

  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.text(`Dirección: ${COMPANY.domicilio}`, 14, y);
  doc.text(`${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`, 14, y + 4);
  doc.text(`Correo electrónico: ${COMPANY.email}`, 14, y + 8);

  const blob = doc.output('blob');
  saveAs(blob, `Facturacion-${order.orderNumber}.pdf`);
}

/** Orden interna: PDF con datos del proveedor + sus STs. */
export async function downloadOrdenInternaPdfForProvider(
  order: Order,
  group: OrderProviderGroup,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ORDEN INTERNA DE SERVICIOS', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`RIF ${COMPANY.rif}`, 14, y);
  doc.text(COMPANY.name, 60, y);
  doc.text(`FECHA: ${fmtDate(order.orderDate)}`, pageW - 14, y, { align: 'right' });
  y += 4;
  doc.text(`N°: ${order.orderNumber}`, pageW - 14, y, { align: 'right' });
  y += 6;

  const infoRows: [string, string][] = [
    [group.providerType === 'doctor' ? 'Médico Tratante' : 'Centro', group.providerName],
    ['Especialidad', order.specialty?.name ?? ''],
    ['Paciente', `${holderDisplayName(order.patient)}${holderId(order.patient) ? `   CI: ${holderId(order.patient)}` : ''}`],
    ['Patologías', (order.pathologies ?? []).map((p) => p.name).join(', ')],
    ['Clave de Servicio', order.orderNumber],
  ];
  autoTable(doc, {
    startY: y,
    head: [],
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    head: [['Tipos de Servicio realizados por este proveedor']],
    body: group.rows.map((r) => [r.serviceType?.name ?? r.serviceTypeId]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
  });

  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.text(`Dirección: ${COMPANY.domicilio}`, 14, y);
  doc.text(`${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`, 14, y + 4);
  doc.text(`Correo electrónico: ${COMPANY.email}`, 14, y + 8);

  const providerSlug = safeFilenameSegment(group.providerName);
  const typeSlug = group.providerType === 'doctor' ? 'doctor' : 'centro';
  const blob = doc.output('blob');
  saveAs(blob, `Orden-${order.orderNumber}-${typeSlug}-${providerSlug}.pdf`);
}
