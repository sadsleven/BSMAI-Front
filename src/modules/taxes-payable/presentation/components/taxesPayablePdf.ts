import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

function header(doc: jsPDF, title: string, num: string): number {
  doc.setFontSize(14).setFont('helvetica', 'bold');
  doc.text(COMPANY.name, 14, 18);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`RIF: ${COMPANY.rif}`, 14, 24);
  doc.text(COMPANY.domicilio, 14, 29);
  doc.text(`${COMPANY.ciudad} · Tel: ${COMPANY.telefono}`, 14, 34);
  doc.setFontSize(12).setFont('helvetica', 'bold');
  doc.text(title, 14, 46);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`N° ${num}`, 14, 52);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, 14, 57);
  return 65;
}

export async function downloadBatchInvoicePdf(batch: TaxBatch): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = header(doc, 'FACTURA AGRUPADA — LOTE SENIAT', batch.taxBatchNumber);

  let total = 0;
  const body = (batch.obligations ?? []).map((o) => {
    const amt = taxAmountBs(o);
    total += amt;
    return [
      o.taxPayableNumber,
      recipientName(o),
      (o.internalNumbers ?? []).join(', ') || '—',
      `${formatMoney(amt)} Bs.`,
    ];
  });

  autoTable(doc, {
    head: [['N° comprobante', 'Proveedor', 'Órdenes', 'Retención Bs.']],
    body,
    startY: y + 3,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [229, 231, 235], textColor: 20 },
    foot: [['', '', 'TOTAL AL SENIAT Bs.', `${formatMoney(total)} Bs.`]],
    footStyles: { fontStyle: 'bold', fillColor: [243, 244, 246], textColor: 20 },
  });

  const blob = doc.output('blob');
  saveAs(blob, `Factura-Lote-${safeFilenameSegment(batch.taxBatchNumber)}.pdf`);
}

export async function downloadWithholdingPdf(tax: TaxObligation): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = header(doc, 'COMPROBANTE DE RETENCIÓN DE ISLR', tax.taxPayableNumber);

  const rows: string[][] = [
    ['Proveedor', recipientName(tax)],
    ['Tipo', tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'],
    ['Régimen', PERSON_TYPE_LABEL[tax.personType]],
    ['Órdenes', (tax.internalNumbers ?? []).join(', ') || '—'],
    ['Concepto', 'Honorarios profesionales no mercantiles (Decreto 1.808)'],
    ['UT vigente', `Bs. ${fmtBs(Number(tax.taxUnitAmountBs))}`],
    ['Base imponible (bruto)', `${fmtBs(Number(tax.grossAmountBs))} Bs.`],
    ['Tasa aplicada', `${(Number(tax.taxRate) * 100).toFixed(0)}%`],
    ['Sustraendo', `${fmtBs(Number(tax.subtrahendBs))} Bs.`],
    ['RETENCIÓN', `${fmtBs(taxAmountBs(tax))} Bs.`],
  ];

  autoTable(doc, {
    body: rows,
    startY: y,
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 110 },
    },
  });

  const afterY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 80;
  doc.setFontSize(8).setFont('helvetica', 'italic');
  doc.text('Fórmula PNR: (Monto × 3%) − (UT × 0,03 × 83,33334)', 14, afterY + 8);
  doc.text('Fórmula PJD: Monto × 5% (sin sustraendo, sin umbral)', 14, afterY + 13);

  const blob = doc.output('blob');
  saveAs(blob, `Comprobante-Retencion-${safeFilenameSegment(tax.taxPayableNumber)}.pdf`);
}
