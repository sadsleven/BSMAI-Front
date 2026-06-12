import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  PERSON_TYPE_LABEL,
  recipientName,
  type TaxPayable,
} from '../../domain/models/taxesPayable';
import { formatMoney } from '@/lib/format/money';

const COMPANY = {
  name: 'ATENCIÓN MÉDICA AFMI',
  rif: 'J-50190282-8',
  domicilio: 'Av. Bompland con 4ta. Transversal de la Av. Gran Mariscal, oficina 01',
  ciudad: 'Cumaná. Edo. Sucre.',
  telefono: '0293-4337343',
  email: 'atencionfamiliarmedicointegral@gmail.com',
};

function fmtBs(n: number): string {
  return formatMoney(n);
}

function safeFilenameSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 80) || 'sin_nombre';
}

/**
 * Factura agrupada: lista de órdenes contenidas en el pago al proveedor,
 * con sus montos y el total bruto. Una factura por taxes_payable.
 */
export async function downloadInvoiceXlsx(tax: TaxPayable): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Factura');
  ws.columns = [
    { width: 14 }, // N° orden
    { width: 38 }, // Detalle
    { width: 14 }, // Bruto USD
  ];

  let row = 1;
  ws.getCell(row, 1).value = COMPANY.name;
  ws.getCell(row, 1).font = { bold: true, size: 14 };
  row++;
  ws.getCell(row, 1).value = `RIF: ${COMPANY.rif}`;
  row++;
  ws.getCell(row, 1).value = COMPANY.domicilio;
  row++;
  ws.getCell(row, 1).value = `${COMPANY.ciudad} · Tel: ${COMPANY.telefono}`;
  row += 2;

  ws.getCell(row, 1).value = `FACTURA AGRUPADA N° ${tax.taxPayableNumber}`;
  ws.getCell(row, 1).font = { bold: true, size: 12 };
  row++;
  ws.getCell(row, 1).value = `Proveedor: ${recipientName(tax)} (${
    tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'
  })`;
  row++;
  ws.getCell(row, 1).value = `Régimen: ${PERSON_TYPE_LABEL[tax.personType]}`;
  row++;
  ws.getCell(row, 1).value = `Fecha: ${new Date(
    tax.createdAt ?? new Date().toISOString(),
  ).toLocaleDateString('es-VE')}`;
  row += 2;

  // Header tabla
  ws.getCell(row, 1).value = 'N° orden';
  ws.getCell(row, 2).value = 'Cuenta por pagar';
  ws.getCell(row, 3).value = 'Bruto USD';
  for (let c = 1; c <= 3; c++) {
    ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
  }
  row++;

  let totalGrossUsd = 0;
  const ap = tax.accountsPayables ?? [];
  const orders = tax.orders ?? [];
  const orderMap = new Map(orders.map((o) => [o.id, o.orderNumber]));
  for (const a of ap) {
    const grossUsd = Number(a.providerAmount ?? 0);
    totalGrossUsd += grossUsd;
    ws.getCell(row, 1).value = orderMap.get(a.orderId) ?? '—';
    ws.getCell(row, 2).value = a.payableNumber;
    ws.getCell(row, 3).value = grossUsd;
    ws.getCell(row, 3).numFmt = '#,##0.00';
    row++;
  }
  // Total
  ws.getCell(row, 1).value = 'Total bruto USD';
  ws.getCell(row, 1).font = { bold: true };
  ws.getCell(row, 3).value = totalGrossUsd;
  ws.getCell(row, 3).numFmt = '#,##0.00';
  ws.getCell(row, 3).font = { bold: true };
  row += 2;

  ws.getCell(row, 1).value = 'Bruto Bs.';
  ws.getCell(row, 3).value = fmtBs(Number(tax.grossAmountBs));
  row++;
  ws.getCell(row, 1).value = 'Retención Bs.';
  ws.getCell(row, 3).value = fmtBs(Number(tax.taxAmountBs));
  row++;
  ws.getCell(row, 1).value = 'Neto al proveedor Bs.';
  ws.getCell(row, 1).font = { bold: true };
  ws.getCell(row, 3).value = fmtBs(
    Math.max(0, Number(tax.grossAmountBs) - Number(tax.taxAmountBs)),
  );
  ws.getCell(row, 3).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Factura-${safeFilenameSegment(tax.taxPayableNumber)}.xlsx`;
  saveAs(new Blob([buf]), filename);
}

/**
 * Comprobante de retención de ISLR (Decreto 1.808). Detalla la fórmula
 * aplicada y los montos del cálculo.
 */
export async function downloadWithholdingXlsx(tax: TaxPayable): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Comprobante');
  ws.columns = [{ width: 32 }, { width: 22 }];

  let row = 1;
  ws.getCell(row, 1).value = COMPANY.name;
  ws.getCell(row, 1).font = { bold: true, size: 14 };
  row++;
  ws.getCell(row, 1).value = `Agente de retención RIF: ${COMPANY.rif}`;
  row++;
  ws.getCell(row, 1).value = COMPANY.domicilio;
  row++;
  ws.getCell(row, 1).value = COMPANY.ciudad;
  row += 2;

  ws.getCell(row, 1).value = 'COMPROBANTE DE RETENCIÓN DE ISLR';
  ws.getCell(row, 1).font = { bold: true, size: 12 };
  row++;
  ws.getCell(row, 1).value = `N° ${tax.taxPayableNumber}`;
  row++;
  ws.getCell(row, 1).value = `Fecha: ${new Date(
    tax.createdAt ?? new Date().toISOString(),
  ).toLocaleDateString('es-VE')}`;
  row += 2;

  const rows: Array<[string, string | number]> = [
    ['Proveedor', recipientName(tax)],
    [
      'Tipo',
      tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención',
    ],
    ['Régimen', PERSON_TYPE_LABEL[tax.personType]],
    ['Concepto', 'Honorarios profesionales no mercantiles (Decreto 1.808)'],
    [
      'UT vigente',
      `Bs. ${fmtBs(Number(tax.taxUnitAmountBs))} (efectivo ${new Date(
        tax.taxUnit.effectiveDate,
      ).toLocaleDateString('es-VE')})`,
    ],
    ['Base imponible (bruto Bs.)', fmtBs(Number(tax.grossAmountBs))],
    ['Tasa aplicada', `${(Number(tax.taxRate) * 100).toFixed(0)}%`],
    ['Sustraendo (Bs.)', fmtBs(Number(tax.subtrahendBs))],
    ['Retención (Bs.)', fmtBs(Number(tax.taxAmountBs))],
  ];

  for (const [label, value] of rows) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 2).value = value;
    row++;
  }
  row++;

  ws.getCell(row, 1).value = 'Fórmula PNR: (Monto × 3%) − (UT × 0,03 × 83,33334)';
  ws.getCell(row, 1).font = { italic: true };
  row++;
  ws.getCell(row, 1).value = 'Fórmula PJD: Monto × 5% (sin sustraendo)';
  ws.getCell(row, 1).font = { italic: true };

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Comprobante-Retencion-${safeFilenameSegment(tax.taxPayableNumber)}.xlsx`;
  saveAs(new Blob([buf]), filename);
}
