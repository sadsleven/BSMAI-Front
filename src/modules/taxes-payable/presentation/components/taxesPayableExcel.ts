import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  PERSON_TYPE_LABEL,
  recipientName,
  taxAmountBs,
  type TaxBatch,
  type TaxObligation,
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
  const cleaned = Array.from(s)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || '<>:"/\\|?*'.includes(ch)) return '_';
      return ch;
    })
    .join('');
  return cleaned.trim().slice(0, 80) || 'sin_nombre';
}

/**
 * Factura agrupada del lote SENIAT: lista de obligaciones de retención (de uno o
 * varios proveedores) con sus montos y el total. Una factura por lote.
 */
export async function downloadBatchInvoiceXlsx(batch: TaxBatch): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Factura');
  ws.columns = [
    { width: 18 }, // N° comprobante
    { width: 30 }, // Proveedor
    { width: 28 }, // Órdenes
    { width: 16 }, // Retención Bs.
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

  ws.getCell(row, 1).value = `FACTURA AGRUPADA — LOTE SENIAT N° ${batch.taxBatchNumber}`;
  ws.getCell(row, 1).font = { bold: true, size: 12 };
  row++;
  ws.getCell(row, 1).value = `Fecha: ${new Date(
    batch.createdAt ?? new Date().toISOString(),
  ).toLocaleDateString('es-VE')}`;
  row += 2;

  ws.getCell(row, 1).value = 'N° comprobante';
  ws.getCell(row, 2).value = 'Proveedor';
  ws.getCell(row, 3).value = 'Órdenes';
  ws.getCell(row, 4).value = 'Retención Bs.';
  for (let c = 1; c <= 4; c++) {
    ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
  }
  row++;

  let total = 0;
  for (const o of batch.obligations ?? []) {
    const amt = taxAmountBs(o);
    total += amt;
    ws.getCell(row, 1).value = o.taxPayableNumber;
    ws.getCell(row, 2).value = recipientName(o);
    ws.getCell(row, 3).value = (o.internalNumbers ?? []).join(', ') || '—';
    ws.getCell(row, 4).value = amt;
    ws.getCell(row, 4).numFmt = '#,##0.00';
    row++;
  }
  ws.getCell(row, 1).value = 'Total al SENIAT Bs.';
  ws.getCell(row, 1).font = { bold: true };
  ws.getCell(row, 4).value = total;
  ws.getCell(row, 4).numFmt = '#,##0.00';
  ws.getCell(row, 4).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Factura-Lote-${safeFilenameSegment(batch.taxBatchNumber)}.xlsx`;
  saveAs(new Blob([buf]), filename);
}

/**
 * Comprobante de retención de ISLR (Decreto 1.808) de una obligación. Detalla
 * la fórmula aplicada y los montos del cálculo.
 */
export async function downloadWithholdingXlsx(tax: TaxObligation): Promise<void> {
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
    ['Tipo', tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'],
    ['Régimen', PERSON_TYPE_LABEL[tax.personType]],
    ['Órdenes', (tax.internalNumbers ?? []).join(', ') || '—'],
    ['Concepto', 'Honorarios profesionales no mercantiles (Decreto 1.808)'],
    ['UT vigente', `Bs. ${fmtBs(Number(tax.taxUnitAmountBs))}`],
    ['Base imponible (bruto Bs.)', fmtBs(Number(tax.grossAmountBs))],
    ['Tasa aplicada', `${(Number(tax.taxRate) * 100).toFixed(0)}%`],
    ['Sustraendo (Bs.)', fmtBs(Number(tax.subtrahendBs))],
    ['Retención (Bs.)', fmtBs(taxAmountBs(tax))],
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
