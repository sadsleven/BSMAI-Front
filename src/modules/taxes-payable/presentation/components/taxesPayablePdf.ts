import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import {
  PERSON_TYPE_LABEL,
  recipientName,
  type TaxPayable,
} from '../../domain/models/taxesPayable';

const COMPANY = {
  name: 'ATENCIÓN MÉDICA AFMI',
  rif: 'J-50190282-8',
  domicilio: 'Av. Bompland con 4ta. Transversal de la Av. Gran Mariscal, oficina 01',
  ciudad: 'Cumaná. Edo. Sucre.',
  telefono: '0293-4337343',
};

function fmtBs(n: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function safeFilenameSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 80) || 'sin_nombre';
}

function header(doc: jsPDF, title: string, taxNumber: string): number {
  doc.setFontSize(14).setFont('helvetica', 'bold');
  doc.text(COMPANY.name, 14, 18);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`RIF: ${COMPANY.rif}`, 14, 24);
  doc.text(COMPANY.domicilio, 14, 29);
  doc.text(`${COMPANY.ciudad} · Tel: ${COMPANY.telefono}`, 14, 34);
  doc.setFontSize(12).setFont('helvetica', 'bold');
  doc.text(title, 14, 46);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`N° ${taxNumber}`, 14, 52);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, 14, 57);
  return 65;
}

export async function downloadInvoicePdf(tax: TaxPayable): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, 'FACTURA AGRUPADA', tax.taxPayableNumber);

  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(`Proveedor: ${recipientName(tax)}`, 14, y);
  y += 5;
  doc.text(
    `Tipo: ${tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'}  ·  Régimen: ${
      PERSON_TYPE_LABEL[tax.personType]
    }`,
    14,
    y,
  );
  y += 5;

  const orderMap = new Map((tax.orders ?? []).map((o) => [o.id, o.orderNumber]));
  const ap = tax.accountsPayables ?? [];
  let totalGrossUsd = 0;
  const body = ap.map((a) => {
    const gross = Number(a.providerAmount ?? 0);
    totalGrossUsd += gross;
    return [
      orderMap.get(a.orderId) ?? '—',
      a.payableNumber,
      `${gross.toFixed(2)} USD`,
    ];
  });

  autoTable(doc, {
    head: [['N° orden', 'Cuenta por pagar', 'Bruto USD']],
    body,
    startY: y + 3,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [229, 231, 235], textColor: 20 },
    foot: [
      ['', 'TOTAL BRUTO USD', `${totalGrossUsd.toFixed(2)} USD`],
    ],
    footStyles: { fontStyle: 'bold', fillColor: [243, 244, 246], textColor: 20 },
  });

  const afterY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 50;
  doc.setFontSize(9);
  doc.text(`Bruto Bs.:  ${fmtBs(Number(tax.grossAmountBs))}`, 14, afterY + 8);
  doc.text(`Retención Bs.:  ${fmtBs(Number(tax.taxAmountBs))}`, 14, afterY + 14);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Neto al proveedor Bs.:  ${fmtBs(
      Math.max(0, Number(tax.grossAmountBs) - Number(tax.taxAmountBs)),
    )}`,
    14,
    afterY + 20,
  );

  const blob = doc.output('blob');
  saveAs(blob, `Factura-${safeFilenameSegment(tax.taxPayableNumber)}.pdf`);
}

export async function downloadWithholdingPdf(tax: TaxPayable): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, 'COMPROBANTE DE RETENCIÓN DE ISLR', tax.taxPayableNumber);

  const rows: string[][] = [
    ['Proveedor', recipientName(tax)],
    ['Tipo', tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'],
    ['Régimen', PERSON_TYPE_LABEL[tax.personType]],
    ['Concepto', 'Honorarios profesionales no mercantiles (Decreto 1.808)'],
    [
      'UT vigente',
      `Bs. ${fmtBs(Number(tax.taxUnitAmountBs))} (${new Date(
        tax.taxUnit.effectiveDate,
      ).toLocaleDateString('es-VE')})`,
    ],
    ['Base imponible (bruto)', `${fmtBs(Number(tax.grossAmountBs))} Bs.`],
    ['Tasa aplicada', `${(Number(tax.taxRate) * 100).toFixed(0)}%`],
    ['Sustraendo', `${fmtBs(Number(tax.subtrahendBs))} Bs.`],
    ['RETENCIÓN', `${fmtBs(Number(tax.taxAmountBs))} Bs.`],
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
