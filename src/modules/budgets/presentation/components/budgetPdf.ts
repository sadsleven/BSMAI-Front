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
  BUDGET_HEADER_FONT,
  budgetCompanyHeaderLines,
  budgetFileBaseName,
  type BudgetDocData,
  type BudgetDocOptions,
} from './budgetDocument';

const AFMI_BLUE: [number, number, number] = [0, 32, 96];
const APS_BLUE: [number, number, number] = [0, 56, 149];

/** Las mismas imágenes del Excel original de AFMI, servidas desde public/. */
const IMG = {
  logo: { file: 'presupuesto-logo-afmi.png', type: 'PNG', mime: 'image/png' },
  // PNG: lleva el fondo gris del escaneo ya transparente.
  signature: {
    file: 'presupuesto-firma-sello.png',
    type: 'PNG',
    mime: 'image/png',
  },
  altamira: {
    file: 'presupuesto-logo-altamira.jpg',
    type: 'JPEG',
    mime: 'image/jpeg',
  },
} as const;

type BudgetImage = (typeof IMG)[keyof typeof IMG];

/**
 * Carga una imagen de public/ como dataURL. Null si falla (el documento sale
 * sin ella antes que no salir). Convierte los bytes a base64 a mano en vez de
 * usar `FileReader`: evita el baile de callbacks y funciona igual fuera del
 * navegador, lo que permite generar el PDF en pruebas.
 */
const imageCache = new Map<string, Promise<string | null>>();
function loadImageDataUrl(img: BudgetImage): Promise<string | null> {
  let hit = imageCache.get(img.file);
  if (!hit) {
    hit = (async () => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}${img.file}`);
        if (!resp.ok) return null;
        const bytes = new Uint8Array(await resp.arrayBuffer());
        let binary = '';
        // Por trozos: `String.fromCharCode(...bytes)` desborda la pila con
        // imágenes de más de ~100 KB.
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        return `data:${img.mime};base64,${btoa(binary)}`;
      } catch {
        return null;
      }
    })();
    imageCache.set(img.file, hit);
  }
  return hit;
}

/** Dibuja una imagen del formato si se pudo cargar. Medidas en mm. */
async function drawImage(
  doc: jsPDF,
  img: BudgetImage,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  const dataUrl = await loadImageDataUrl(img);
  if (dataUrl) doc.addImage(dataUrl, img.type, x, y, w, h);
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
  // Mismo tamaño que en el Excel (148×82 px → mm).
  await drawImage(doc, IMG.logo, marginL, 12, 39.2, 21.7);

  const cx = pageW / 2 + 15;
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  // Las mismas cinco líneas y los mismos dos tamaños que la celda del Excel.
  budgetCompanyHeaderLines().forEach((line, i) => {
    doc.setFontSize(i === 0 ? BUDGET_HEADER_FONT.title : BUDGET_HEADER_FONT.body);
    doc.text(line, cx, y, { align: 'center', maxWidth: pageW - cx - marginL + 40 });
    y += i === 0 ? 5 : 4;
  });
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
 * Pie: la firma y sello escaneados de AFMI, "Elaborado por" y la leyenda
 * "FIRMA Y SELLO" debajo. La imagen va al mismo tamaño que en el Excel
 * (153×93 px → mm) y `y` es la línea de "Elaborado por", así que el sello se
 * dibuja encima.
 */
async function drawFooter(
  doc: jsPDF,
  y: number,
  data: BudgetDocData,
  marginL: number,
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  await drawImage(doc, IMG.signature, pageW / 2 + 20 - 40.5 / 2, y - 28, 40.5, 24.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Elaborado por: ${data.preparedBy}`, marginL, y);
  doc.text('FIRMA Y SELLO', pageW / 2 + 20, y + 6, { align: 'center' });
}

/**
 * Línea horizontal punteada, como las que encierran la tabla de
 * procedimientos en el Excel. `autoTable` sólo sabe hacer bordes sólidos, así
 * que las reglas se dibujan aparte y las celdas van sin borde.
 */
function dottedRule(doc: jsPDF, y: number, x0: number, x1: number): void {
  doc.saveGraphicsState();
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([0.5, 0.7], 0);
  doc.line(x0, y, x1, y);
  doc.setLineDashPattern([], 0);
  doc.restoreGraphicsState();
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
 * Espeja `downloadBudgetPatientXlsx`, opción de bolívares incluida.
 */
export async function downloadBudgetPatientPdf(
  budget: Budget,
  options: BudgetDocOptions = {},
): Promise<void> {
  const data = await buildBudgetDoc(budget, options);
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

  const inBs = data.showBs;
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
    headStyles: { fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: pageW - marginL * 2 - 40 },
      1: { cellWidth: 40, halign: 'center' },
    },
    // Reglas punteadas arriba del encabezado y debajo de la última fila,
    // como el formato original.
    didDrawPage: (data_) => {
      const t = data_.table;
      dottedRule(doc, t.body[0].cells[0].y, marginL, pageW - marginL);
      const last = t.body[t.body.length - 1].cells[0];
      dottedRule(doc, last.y + last.height, marginL, pageW - marginL);
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

  await drawFooter(doc, y + 36, data, marginL);
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
    headStyles: { fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { cellWidth: pageW - marginL * 2 - 40 },
      1: { cellWidth: 40, halign: 'center' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'head' && cell.column.index === 1) {
        cell.cell.styles.halign = 'center';
      }
    },
    // Reglas punteadas arriba del encabezado y debajo de la última fila.
    didDrawPage: (data_) => {
      const t = data_.table;
      dottedRule(doc, t.head[0].cells[0].y, marginL, pageW - marginL);
      const last = t.body[t.body.length - 1].cells[0];
      dottedRule(doc, last.y + last.height, marginL, pageW - marginL);
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

  await drawFooter(doc, y + 36, data, marginL);
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
  // Operador y teléfono de la clínica van en negrita, como en el Excel.
  const boldValueRows = new Set([rows.length - 2, rows.length - 1]);
  // Fila del título: logo del seguro a la izquierda y el título a la derecha,
  // dentro del recuadro — igual que la primera fila de la hoja del Excel.
  const TITLE_ROW_H = 14;

  autoTable(doc, {
    startY: 18,
    margin: { left: marginL, right: marginL },
    body: [
      ['', 'SOLICITUD SERVICIO APS'],
      // Fila en blanco entre el título y los datos, como la hoja del Excel.
      ['', ''],
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
      if (cell.row.index === 0) {
        cell.cell.styles.minCellHeight = TITLE_ROW_H;
        if (cell.column.index === 1) {
          cell.cell.styles.fontSize = 14;
          cell.cell.styles.fontStyle = 'bold';
          cell.cell.styles.halign = 'center';
          cell.cell.styles.textColor = APS_BLUE;
        }
        return;
      }
      // Las filas de datos arrancan tras el título y la fila en blanco.
      const i = cell.row.index - 2;
      // "COSTO DE LA ATENCION" va en azul, como en el formulario del seguro.
      if (i === costRowIndex && cell.column.index === 0) {
        cell.cell.styles.textColor = APS_BLUE;
      }
      if (boldValueRows.has(i) && cell.column.index === 1) {
        cell.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // El logo del seguro se dibuja encima de la celda del título, ya medida.
  await drawImage(doc, IMG.altamira, marginL + 3, 19.5, 20.9, 13.5);

  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'aps')}.pdf`);
}

/** Descarga la plantilla pedida en PDF. */
export function downloadBudgetPdf(
  budget: Budget,
  template: BudgetTemplate,
  options: BudgetDocOptions = {},
): Promise<void> {
  switch (template) {
    case 'patient':
      return downloadBudgetPatientPdf(budget, options);
    case 'insurance':
      return downloadBudgetInsurancePdf(budget);
    case 'aps':
      return downloadBudgetApsPdf(budget);
  }
}
