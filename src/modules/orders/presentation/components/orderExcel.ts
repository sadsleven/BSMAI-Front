import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Order, OrderServiceTypeRow } from '../../domain/models/order';
import { holderDisplayName } from '../../domain/models/order';

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

function applyHeader(ws: ExcelJS.Worksheet, title: string) {
  ws.mergeCells('A1:G1');
  const cell = ws.getCell('A1');
  cell.value = title;
  cell.font = { name: 'Calibri', size: 14, bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: s, left: s, right: s, bottom: s };
}

/** Sanitiza string para nombre de archivo (sin chars problemáticos en Windows/macOS). */
function safeFilenameSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 80) || 'sin_nombre';
}

export interface OrderProviderGroup {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  rows: OrderServiceTypeRow[];
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
      groups.set(key, {
        key,
        providerType: row.providerType,
        providerId: id,
        providerName: name,
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }
  return Array.from(groups.values());
}

export async function downloadFacturacionXlsx(order: Order): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('FACTURACION');

  ws.columns = [
    { width: 22 },
    { width: 18 },
    { width: 38 },
    { width: 18 },
    { width: 18 },
  ];

  applyHeader(ws, 'FACTURACIÓN');

  const insurance = order.insurance?.name ?? '';
  const contractor = order.contractor?.name ?? '';
  const holder = holderDisplayName(order.holder);
  const patient = holderDisplayName(order.patient);
  const holderCi = holderId(order.holder);
  const patientCi = holderId(order.patient);

  ws.getCell('C3').value = ' ';
  ws.getCell('D3').value = 'FECHA DE EMISIÓN:';
  ws.getCell('E3').value = fmtDate(order.orderDate);

  ws.getCell('A4').value = ' RAZÓN SOCIAL: ';
  ws.getCell('C4').value = insurance;

  ws.getCell('A5').value = 'Domicilio Fiscal:';
  ws.getCell('C5').value = '';

  ws.getCell('A7').value = 'RIF:';
  ws.getCell('C7').value = '';
  ws.getCell('D7').value = 'Teléfono:';

  ws.getCell('A8').value = 'CONTRATANTE:';
  ws.getCell('C8').value = contractor;

  ws.getCell('A9').value = 'NOMBRE DEL TITULAR:';
  ws.getCell('C9').value = holder;
  ws.getCell('D9').value = `CI: ${holderCi}`;

  ws.getCell('A10').value = 'NOMBRE DEL PACIENTE:';
  ws.getCell('C10').value = patient;
  ws.getCell('D10').value = `CI: ${patientCi}`;

  ws.getCell('A11').value = 'Dirección:';
  ws.getCell('C11').value = order.holder?.businessName
    ? ''
    : (order.holder as { address?: string } | undefined)?.address ?? '';

  ws.getCell('A12').value = 'CLAVE DE SERVICIO:';
  ws.getCell('C12').value = order.orderNumber;
  ws.getCell('D12').value = 'CONDICIONES DE PAGO';
  ws.getCell('E12').value = order.type.toUpperCase();

  const headerRow = ws.getRow(13);
  headerRow.values = ['CANTIDAD', 'N° ORDEN', 'DETALLE DE SERVICIOS', 'P. U Bs.', 'TOTAL Bs.'];
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 5; c++) headerRow.getCell(c).border = thinBorder();

  const detailRow = ws.getRow(14);
  const stNames = (order.orderServiceTypes ?? [])
    .map((row) => row.serviceType?.name)
    .filter((n): n is string => !!n)
    .join(', ');
  const pathNames = (order.pathologies ?? []).map((p) => p.name).join(', ');
  const detail = [order.specialty?.name, stNames, pathNames]
    .filter((v) => !!v && v.length > 0)
    .join(' · ');
  detailRow.getCell(1).value = '01';
  detailRow.getCell(2).value = order.orderNumber;
  detailRow.getCell(3).value = detail;
  detailRow.getCell(4).value = Number(order.priceAmount);
  detailRow.getCell(5).value = Number(order.priceAmount);
  for (let c = 1; c <= 5; c++) detailRow.getCell(c).border = thinBorder();

  const subtotalRow = ws.getRow(16);
  subtotalRow.getCell(3).value = 'SUB-TOTAL';
  subtotalRow.getCell(4).value = order.priceCurrency === 'USD' ? '$' : 'Bs';
  subtotalRow.getCell(5).value = Number(order.priceAmount);
  subtotalRow.font = { bold: true };

  ws.getCell('C17').value = 'EXENTO';
  ws.getCell('D17').value = order.priceCurrency === 'USD' ? '$' : 'Bs';
  ws.getCell('E17').value = Number(order.priceAmount);

  ws.getCell('A18').value = `EQUIVALENCIA : ${order.priceCurrency}`;
  ws.getCell('C18').value = 'BASE IMPONIBLE';
  ws.getCell('D18').value = order.priceCurrency === 'USD' ? '$' : 'Bs';
  ws.getCell('E18').value = Number(order.priceAmount);

  ws.getCell('A19').value = 'Tasa de cambio:';
  ws.getCell('C19').value = 'IVA % (E)';
  ws.getCell('D19').value = order.priceCurrency === 'USD' ? '$' : 'Bs';
  ws.getCell('E19').value = 0;

  const totalRow = ws.getRow(20);
  totalRow.getCell(3).value = 'TOTAL A PAGAR';
  totalRow.getCell(4).value = order.priceCurrency === 'USD' ? '$' : 'Bs';
  totalRow.getCell(5).value = Number(order.priceAmount);
  totalRow.font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Facturacion-${order.orderNumber}.xlsx`,
  );
}

/**
 * Genera 1 XLSX de "Orden interna" para UN proveedor de la orden. Agrupa todos
 * sus Tipos de Servicio en un solo archivo. Para múltiples proveedores, llamar
 * `downloadOrdenInternaForAllProviders` que descarga uno por cada uno.
 */
export async function downloadOrdenInternaForProvider(
  order: Order,
  group: OrderProviderGroup,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('ORDEN INTERNA');

  ws.columns = [
    { width: 18 },
    { width: 18 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 22 },
  ];

  applyHeader(ws, 'ORDEN INTERNA DE SERVICIOS');

  ws.getCell('A2').value = `RIF ${COMPANY.rif}`;
  ws.getCell('C2').value = COMPANY.name;
  ws.getCell('F2').value = 'FECHA';
  ws.getCell('G2').value = fmtDate(order.orderDate);

  ws.getCell('F3').value = 'N°';
  ws.getCell('G3').value = order.orderNumber;

  ws.getCell('A5').value = group.providerType === 'doctor' ? 'Médico Tratante:' : 'Centro:';
  ws.getCell('C5').value = group.providerName;
  ws.getCell('F5').value = 'Especialidad:';
  ws.getCell('G5').value = order.specialty?.name ?? '';

  ws.getCell('A7').value = 'Paciente';
  ws.getCell('C7').value = holderDisplayName(order.patient);
  ws.getCell('F7').value = 'Cédula:';
  ws.getCell('G7').value = holderId(order.patient);

  ws.getCell('A8').value = 'Edad:';
  ws.getCell('B8').value = '';
  ws.getCell('D8').value = 'Teléfono:';
  ws.getCell('E8').value = '';
  ws.getCell('F8').value = 'Referencia:';
  ws.getCell('G8').value = '';

  ws.getCell('A9').value = 'Dirección:';
  ws.getCell('B9').value = '';

  ws.getCell('A10').value = 'Patologías:';
  ws.getCell('B10').value = (order.pathologies ?? []).map((p) => p.name).join(', ');
  ws.getCell('F10').value = 'Clave de Servicio:';
  ws.getCell('G10').value = order.orderNumber;

  const tiposHeader = ws.getRow(11);
  tiposHeader.getCell(1).value = 'Tipos de Servicio realizados por este proveedor';
  tiposHeader.font = { bold: true };
  tiposHeader.alignment = { horizontal: 'center' };
  ws.mergeCells('A11:G11');

  // Una fila por ST del proveedor.
  let r = 12;
  for (const row of group.rows) {
    ws.getCell(`A${r}`).value = row.serviceType?.name ?? row.serviceTypeId;
    ws.mergeCells(`A${r}:G${r}`);
    r += 1;
  }

  // Footer block
  ws.getCell(`A${r + 1}`).value = `Dirección: ${COMPANY.domicilio}`;
  ws.mergeCells(`A${r + 1}:G${r + 1}`);
  ws.getCell(`A${r + 2}`).value = `${COMPANY.ciudad} Teléfonos: ${COMPANY.telefono}`;
  ws.mergeCells(`A${r + 2}:G${r + 2}`);
  ws.getCell(`A${r + 3}`).value = `Correo electrónico: ${COMPANY.email}`;
  ws.mergeCells(`A${r + 3}:G${r + 3}`);

  // Apply borders to data block
  for (let rowIdx = 5; rowIdx < r; rowIdx++) {
    for (let c = 1; c <= 7; c++) {
      ws.getRow(rowIdx).getCell(c).border = thinBorder();
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const providerSlug = safeFilenameSegment(group.providerName);
  const typeSlug = group.providerType === 'doctor' ? 'doctor' : 'centro';
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Orden-${order.orderNumber}-${typeSlug}-${providerSlug}.xlsx`,
  );
}

/** Descarga 1 XLSX por cada proveedor distinto de la orden. */
export async function downloadOrdenInternaForAllProviders(order: Order): Promise<void> {
  for (const group of groupOrderProviders(order)) {
    await downloadOrdenInternaForProvider(order, group);
  }
}
