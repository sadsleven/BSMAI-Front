import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { formatDateOnly } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Budget, BudgetTemplate } from '../../domain/models/budget';
import {
  APS_ATTACHMENTS_NOTE,
  BUDGET_COMPANY,
  buildBudgetDoc,
  budgetBankLines,
  budgetFileBaseName,
  type BudgetDocData,
} from './budgetDocument';

const AFMI_BLUE: [number, number, number] = [0, 32, 96];
const APS_BLUE: [number, number, number] = [0, 56, 149];

/**
 * Carga el logo AFMI desde public/ como dataURL. Null si falla (el documento
 * sale sin logo antes que no salir). Convierte los bytes a base64 a mano en
 * vez de usar `FileReader`: evita el baile de callbacks y funciona igual fuera
 * del navegador, lo que permite generar el PDF en pruebas.
 */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}excel-image.png`);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    // Por trozos: `String.fromCharCode(...bytes)` desborda la pila con imágenes
    // de más de ~100 KB.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

async function resolveBankName(budget: Budget): Promise<string> {
  const code = budget.paymentAccount?.bankCode;
  if (!code) return '';
  try {
    const banks = await bankGateway.list();
    return banks.find((b) => b.code === code)?.name ?? '';
  } catch {
    return '';
  }
}

/**
 * Cabecera de las plantillas PACIENTE y SEGUROS: logo a la izquierda y el
 * bloque de razón social / RIF / dirección / teléfonos centrado a su derecha.
 * Devuelve la `y` donde sigue el documento.
 */
async function drawCompanyHeader(doc: jsPDF, marginL: number): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await loadLogoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', marginL, 12, 45, 15);

  const cx = pageW / 2 + 15;
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const lines = [
    BUDGET_COMPANY.name,
    `RIF ${BUDGET_COMPANY.rif}`,
    BUDGET_COMPANY.addressLine1,
    BUDGET_COMPANY.addressLine2,
    `Teléfonos: ${BUDGET_COMPANY.phones}`,
  ];
  for (const line of lines) {
    doc.text(line, cx, y, { align: 'center', maxWidth: pageW - cx - marginL + 40 });
    y += 4;
  }
  return Math.max(y, 30);
}

/** Título "PRESUPUESTO DE SERVICIOS." en el azul del formato. */
function drawTitle(doc: jsPDF, y: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...AFMI_BLUE);
  doc.text('PRESUPUESTO DE SERVICIOS.', pageW / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  return y + 10;
}

/**
 * Pie: "Elaborado por" y el espacio de FIRMA Y SELLO. El sello va en blanco a
 * propósito — el documento se firma y sella a mano.
 */
function drawFooter(doc: jsPDF, y: number, data: BudgetDocData, marginL: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Elaborado por: ${data.preparedBy}`, marginL, y);
  doc.text('FIRMA Y SELLO', pageW / 2 + 20, y + 22, { align: 'center' });
}

/** Etiqueta + valor en una línea, con la etiqueta en negrita. */
function drawField(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  labelWidth: number,
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(value, x + labelWidth, y, { maxWidth: 110 });
}

/**
 * Plantilla PACIENTE en PDF — montos en Bs, con total en $ y tasa BCV al pie.
 * Espeja `downloadBudgetPatientXlsx`.
 */
export async function downloadBudgetPatientPdf(budget: Budget): Promise<void> {
  const data = await buildBudgetDoc(budget);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;

  let y = await drawCompanyHeader(doc, marginL);
  y = drawTitle(doc, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FECHA DEL PRESUPUESTO:', pageW - marginL - 40, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(formatDateOnly(budget.budgetDate), pageW - marginL, y, {
    align: 'right',
  });
  y += 10;

  for (const [label, value] of [
    ['PACIENTE:', data.patientName],
    ['CEDULA:', data.patientId],
    ['DIAGNOSTICO:', data.diagnosis],
    ['TELEFONO:', data.patientPhone],
  ] as Array<[string, string]>) {
    drawField(doc, marginL, y, label, value, 32);
    y += 7;
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROCEDIMIENTOS A REALIZAR:', marginL, y);

  const inBs = data.rateBs > 0;
  autoTable(doc, {
    startY: y + 3,
    margin: { left: marginL, right: marginL },
    head: [['', inBs ? 'COSTO BS' : 'COSTO $']],
    body: data.lines.map((l) => [
      l.name,
      formatMoney(inBs ? l.totalUsd * data.rateBs : l.totalUsd),
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.4, right: 1.4 },
      lineColor: [0, 0, 0],
    },
    headStyles: {
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: { bottom: 0.2 },
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: pageW - marginL * 2 - 40 },
      1: { cellWidth: 40, halign: 'center' },
    },
    // Línea de cierre bajo la última fila, como el formato original.
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.row.index === data.lines.length - 1) {
        cell.cell.styles.lineWidth = { bottom: 0.2 };
        cell.cell.styles.lineColor = [0, 0, 0];
      }
    },
  });

  // @ts-expect-error lastAutoTable es runtime de jspdf-autotable
  y = (doc.lastAutoTable.finalY as number) + 10;

  // Con ajuste global se imprime SUB-TOTAL + DESCUENTO/RECARGO antes del total:
  // las líneas tienen que sumar lo que se cobra.
  const adjustmentUsd = +(data.totalUsd - data.linesTotalUsd).toFixed(2);
  const toBs = (usd: number): number => (inBs ? usd * data.rateBs : usd);
  const totals: Array<[string, string]> = [];
  if (adjustmentUsd !== 0) {
    totals.push([
      inBs ? 'SUB-TOTAL BS' : 'SUB-TOTAL $',
      formatMoney(toBs(data.linesTotalUsd)),
    ]);
    totals.push([
      adjustmentUsd < 0 ? 'DESCUENTO' : 'RECARGO',
      formatMoney(toBs(adjustmentUsd)),
    ]);
  }
  if (inBs) {
    totals.push(['TOTAL BS', formatMoney(data.totalUsd * data.rateBs)]);
  }
  totals.push(['TOTAL $', formatMoney(data.totalUsd)]);
  if (inBs) totals.push(['TASA Bcv', formatMoney(data.rateBs)]);

  for (const [label, value] of totals) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, marginL, y);
    doc.setFontSize(10);
    doc.text(value, pageW - marginL, y, { align: 'right' });
    y += 6;
  }

  drawFooter(doc, y + 16, data, marginL);
  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'patient')}.pdf`);
}

/**
 * Plantilla SEGUROS en PDF — montos en $ y, al pie, la cuenta donde paga el
 * seguro. Espeja `downloadBudgetInsuranceXlsx`.
 */
export async function downloadBudgetInsurancePdf(budget: Budget): Promise<void> {
  const data = await buildBudgetDoc(budget);
  const bankName = await resolveBankName(budget);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;

  let y = await drawCompanyHeader(doc, marginL);
  y += 6;

  for (const [label, value] of [
    ['FECHA:', formatDateOnly(budget.budgetDate)],
    ['PARA:', (budget.insurance?.name ?? '').toUpperCase()],
    ['RIF:', budget.insurance?.rif ?? ''],
  ] as Array<[string, string]>) {
    drawField(doc, marginL, y, label, value, 20);
    y += 6;
  }

  y = drawTitle(doc, y + 8);

  for (const [label, value] of [
    ['PACIENTE:', data.patientName],
    ['CEDULA:', data.patientId],
    ['TELEFONO:', data.patientPhone],
  ] as Array<[string, string]>) {
    drawField(doc, marginL, y, label, value, 28);
    y += 7;
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROCEDIMIENTOS A REALIZAR:', marginL, y);

  autoTable(doc, {
    startY: y + 3,
    margin: { left: marginL, right: marginL },
    head: [['ESTUDIOS', 'COSTOS $']],
    body: data.lines.map((l) => [l.name, formatMoney(l.totalUsd)]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.4, right: 1.4 },
      lineColor: [0, 0, 0],
    },
    headStyles: {
      fontStyle: 'bold',
      halign: 'left',
      lineWidth: { bottom: 0.2 },
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: pageW - marginL * 2 - 40 },
      1: { cellWidth: 40, halign: 'center' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'head' && cell.column.index === 1) {
        cell.cell.styles.halign = 'center';
      }
      if (cell.section === 'body' && cell.row.index === data.lines.length - 1) {
        cell.cell.styles.lineWidth = { bottom: 0.2 };
        cell.cell.styles.lineColor = [0, 0, 0];
      }
    },
  });

  // @ts-expect-error lastAutoTable es runtime de jspdf-autotable
  y = (doc.lastAutoTable.finalY as number) + 8;

  // Con ajuste global, SUB-TOTAL + DESCUENTO/RECARGO antes del total.
  const adjustmentUsd = +(data.totalUsd - data.linesTotalUsd).toFixed(2);
  const totals: Array<[string, string]> = [];
  if (adjustmentUsd !== 0) {
    totals.push(['SUB-TOTAL $', formatMoney(data.linesTotalUsd)]);
    totals.push([
      adjustmentUsd < 0 ? 'DESCUENTO $' : 'RECARGO $',
      formatMoney(adjustmentUsd),
    ]);
  }
  totals.push(['TOTAL $', formatMoney(data.totalUsd)]);
  for (const [label, value] of totals) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, marginL, y);
    doc.setFontSize(10);
    doc.text(value, pageW - marginL, y, { align: 'right' });
    y += 6;
  }
  y += 6;

  for (const line of budgetBankLines(budget, bankName)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(line, marginL, y);
    y += 5;
  }

  drawFooter(doc, y + 16, data, marginL);
  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'insurance')}.pdf`);
}

/**
 * Plantilla APS en PDF — la solicitud de servicio del seguro, como tabla de
 * dos columnas con rejilla completa. Espeja `downloadBudgetApsXlsx`.
 */
export async function downloadBudgetApsPdf(budget: Budget): Promise<void> {
  const data = await buildBudgetDoc(budget);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;

  const logo = await loadLogoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', marginL, 12, 40, 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...APS_BLUE);
  doc.text('SOLICITUD SERVICIO APS', pageW / 2 + 15, 21, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  const servicio = data.lines.map((l) => l.name).join(' + ');
  const referring = [budget.referringDoctorName, budget.referringSpecialtyName]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' — ');

  const rows: Array<[string, string]> = [
    ['NOMBRE DEL TITULAR:', data.holderName],
    ['NUMERO DE CI:', data.holderId],
    ['NOMBRE DEL PACIENTE', data.patientName],
    ['NUMERO DE CI:', data.patientId],
    ['NO. TELEFONICO DEL PACIENTE', data.patientPhone],
    ['DIAGNOSTICO/SINTOMATOLOGIA', data.diagnosis],
    ['SERVICIO SOLICITADO:', servicio],
    ['NOMBRE Y ESPECIALIDAD DEL MEDICO QUE REFIERE:', referring],
    // El formulario del seguro pide el costo en dólares, sin desglose.
    ['COSTO DE LA ATENCION:', `$${data.totalUsd.toFixed(2)}`],
    ['COMENTARIO/OBSERVACIONES', budget.observations ?? ''],
    ['OPERADOR/CLINICA', data.preparedBy],
    ['TELEFONO DIRECTO CLINICA:', BUDGET_COMPANY.directPhone],
  ];
  const costRowIndex = rows.findIndex(([l]) => l === 'COSTO DE LA ATENCION:');

  autoTable(doc, {
    startY: 30,
    margin: { left: marginL, right: marginL },
    body: [
      ...rows,
      [{ content: APS_ATTACHMENTS_NOTE, colSpan: 2, styles: { fontSize: 7 } }],
    ],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      valign: 'middle',
      minCellHeight: 9,
    },
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold' },
      1: { cellWidth: pageW - marginL * 2 - 72 },
    },
    didParseCell: (cell) => {
      // "COSTO DE LA ATENCION" va en azul, como en el formulario del seguro.
      if (cell.row.index === costRowIndex && cell.column.index === 0) {
        cell.cell.styles.textColor = APS_BLUE;
      }
    },
  });

  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'aps')}.pdf`);
}

/** Descarga la plantilla pedida en PDF. */
export function downloadBudgetPdf(
  budget: Budget,
  template: BudgetTemplate,
): Promise<void> {
  switch (template) {
    case 'patient':
      return downloadBudgetPatientPdf(budget);
    case 'insurance':
      return downloadBudgetInsurancePdf(budget);
    case 'aps':
      return downloadBudgetApsPdf(budget);
  }
}
