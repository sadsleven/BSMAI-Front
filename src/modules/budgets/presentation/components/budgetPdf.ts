import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { formatDateOnly } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Budget, BudgetTemplate } from '../../domain/models/budget';
import {
  APS_ATTACHMENTS_NOTE,
  BUDGET_COMPANY,
  BUDGET_HEADER_FONT,
  buildBudgetDoc,
  budgetBankLines,
  budgetCompanyHeaderLines,
  budgetFileBaseName,
  type BudgetDocData,
  type BudgetDocOptions,
} from './budgetDocument';
import { SheetGrid, cell, rowRule, PT_MM } from './budgetSheetGrid';

const AFMI_BLUE: [number, number, number] = [0, 32, 96];
const APS_BLUE: [number, number, number] = [0, 56, 149];

/** 1 píxel de Excel (96 dpi) en milímetros. */
const PX_MM = 25.4 / 96;
/** EMU (unidad del XML de dibujos de Excel) a milímetros. */
const emuMm = (emu: number): number => (emu / 9525) * PX_MM;

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

/** Tamaño de cada imagen en mm, el mismo que ocupa en la hoja. */
const IMG_MM = {
  logo: { w: 148.2 * PX_MM, h: 82 * PX_MM },
  signature: { w: 153 * PX_MM, h: 93 * PX_MM },
  altamira: { w: 79 * PX_MM, h: 51.13 * PX_MM },
};

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
 * Cabecera de las plantillas PACIENTE y SEGUROS: logo pegado al margen
 * izquierdo y el bloque de razón social centrado en la columna C, que es la
 * celda mergeada donde vive en la hoja. Las cinco líneas llevan los dos
 * tamaños del Excel (razón social más grande).
 */
async function drawCompanyHeader(
  doc: jsPDF,
  grid: SheetGrid,
  logo: { x: number; y: number },
): Promise<void> {
  await drawImage(doc, IMG.logo, logo.x, logo.y, IMG_MM.logo.w, IMG_MM.logo.h);

  const lines = budgetCompanyHeaderLines();
  const cx = grid.xMid(2);
  const lineH = (size: number) => size * PT_MM * 1.3;
  const totalH =
    lineH(BUDGET_HEADER_FONT.title) +
    lineH(BUDGET_HEADER_FONT.body) * (lines.length - 1);
  // El bloque va centrado verticalmente en la fila 1, como la celda C1:C2.
  let y =
    grid.top(1) +
    (grid.height(1) - totalH) / 2 +
    BUDGET_HEADER_FONT.title * PT_MM;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  lines.forEach((line, i) => {
    doc.setFontSize(i === 0 ? BUDGET_HEADER_FONT.title : BUDGET_HEADER_FONT.body);
    doc.text(line, cx, y, { align: 'center' });
    y += lineH(BUDGET_HEADER_FONT.body);
  });
}

/** Título "PRESUPUESTO DE SERVICIOS." centrado en la columna C. */
function drawTitle(doc: jsPDF, grid: SheetGrid, row: number): void {
  cell(doc, grid, row, 2, 'PRESUPUESTO DE SERVICIOS.', {
    size: 16,
    bold: true,
    align: 'center',
    color: AFMI_BLUE,
  });
}

/** Filas que ocupa la firma y sello (93 px ≈ 5 filas de 15 pt), como el Excel. */
const SIGNATURE_ROWS = 5;

/**
 * Pie: la firma y sello escaneados sobre las {@link SIGNATURE_ROWS} filas
 * anteriores, "Elaborado por" en la columna A y "FIRMA Y SELLO" en la C.
 * `signatureXmm` es el desplazamiento dentro de la columna C, como en la hoja.
 */
async function drawFooter(
  doc: jsPDF,
  grid: SheetGrid,
  row: number,
  data: BudgetDocData,
  signatureXmm: number,
): Promise<void> {
  await drawImage(
    doc,
    IMG.signature,
    grid.x(2) + signatureXmm,
    grid.top(row - SIGNATURE_ROWS) + emuMm(184100),
    IMG_MM.signature.w,
    IMG_MM.signature.h,
  );
  cell(doc, grid, row, 0, `Elaborado por: ${data.preparedBy}`, { size: 10 });
  cell(doc, grid, row + 1, 2, 'FIRMA Y SELLO', { size: 11, align: 'center' });
}

/**
 * Plantilla PACIENTE en PDF — montos en Bs, con total en $ y tasa BCV al pie.
 * Mismas filas y columnas que `downloadBudgetPatientXlsx`.
 */
export async function downloadBudgetPatientPdf(
  budget: Budget,
  options: BudgetDocOptions = {},
): Promise<void> {
  const data = await buildBudgetDoc(budget, options);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const grid = new SheetGrid('patient');
  grid.setRowHeight(1, 84).setRowHeight(3, 19.5);
  for (const r of [5, 7, 8, 9, 10]) grid.setRowHeight(r, 15.75);

  await drawCompanyHeader(doc, grid, {
    x: grid.x(0) + emuMm(85725),
    y: grid.top(1) + emuMm(323851),
  });
  drawTitle(doc, grid, 3);

  // R5 — Fecha del presupuesto.
  cell(doc, grid, 5, 2, 'FECHA DEL PRESUPUESTO:', {
    size: 12,
    bold: true,
    align: 'right',
  });
  cell(doc, grid, 5, 3, formatDateOnly(budget.budgetDate), {
    size: 11,
    align: 'right',
  });

  // R7..R10 — Datos del paciente.
  (
    [
      ['PACIENTE:', data.patientName],
      ['CEDULA :', data.patientId],
      ['DIAGNOSTICO:', data.diagnosis],
      ['TELEFONO:', data.patientPhone],
    ] as Array<[string, string]>
  ).forEach(([label, value], i) => {
    const r = 7 + i;
    cell(doc, grid, r, 1, label, { size: 12, bold: true });
    cell(doc, grid, r, 2, value, { size: 11 });
  });

  // R12/R13 — Encabezado de la tabla de procedimientos.
  cell(doc, grid, 12, 2, ' PROCEDIMIENTOS A REALIZAR :', {
    size: 11,
    bold: true,
  });
  cell(doc, grid, 13, 3, data.showBs ? 'COSTO BS' : 'COSTO $', {
    size: 11,
    bold: true,
    align: 'center',
  });
  rowRule(doc, grid, 14);

  // Detalle — una fila por procedimiento.
  const detailStart = 15;
  data.lines.forEach((line, i) => {
    const r = detailStart + i;
    cell(doc, grid, r, 1, line.name, { size: 11, spanTo: 2 });
    cell(
      doc,
      grid,
      r,
      3,
      formatMoney(data.showBs ? line.totalUsd * data.rateBs : line.totalUsd),
      { size: 11, align: 'center' },
    );
  });
  const detailEnd = detailStart + Math.max(data.lines.length, 1);
  rowRule(doc, grid, detailEnd + 1);

  // Totales. Con ajuste global salen SUB-TOTAL + DESCUENTO/RECARGO antes.
  let r = detailEnd + 4;
  const adjustmentUsd = +(data.totalUsd - data.linesTotalUsd).toFixed(2);
  const toBs = (usd: number): number =>
    data.showBs ? +(usd * data.rateBs).toFixed(2) : usd;
  const total = (label: string, value: number, strong = false) => {
    cell(doc, grid, r, 1, label, { size: 11, bold: true });
    cell(doc, grid, r, 3, formatMoney(value), {
      size: strong ? 10 : 11,
      bold: strong,
      align: 'right',
    });
    r += 1;
  };
  if (adjustmentUsd !== 0) {
    total(data.showBs ? 'SUB-TOTAL BS' : 'SUB-TOTAL $', toBs(data.linesTotalUsd));
    total(adjustmentUsd < 0 ? 'DESCUENTO' : 'RECARGO', toBs(adjustmentUsd));
  }
  if (data.showBs) total('TOTAL BS', toBs(data.totalUsd), true);
  total('TOTAL $', data.totalUsd, true);
  if (data.showBs) total('TASA Bcv', data.rateBs);

  await drawFooter(doc, grid, r + 1 + SIGNATURE_ROWS, data, emuMm(1092389));
  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'patient')}.pdf`);
}

/**
 * Plantilla SEGUROS en PDF — montos en $ y, al pie, la cuenta donde paga el
 * seguro. Mismas filas y columnas que `downloadBudgetInsuranceXlsx`.
 */
export async function downloadBudgetInsurancePdf(budget: Budget): Promise<void> {
  const data = await buildBudgetDoc(budget, { includeBs: false });
  const bankName = await resolveBankName(budget);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const grid = new SheetGrid('insurance');
  grid.setRowHeight(1, 84).setRowHeight(7, 19.5);
  for (const r of [3, 4, 5]) grid.setRowHeight(r, 15.75);

  await drawCompanyHeader(doc, grid, {
    x: grid.x(0) + emuMm(38100),
    y: grid.top(1) + emuMm(142876),
  });

  // R3..R5 — A quién va dirigido.
  (
    [
      ['FECHA:', formatDateOnly(budget.budgetDate)],
      ['PARA: ', (budget.insurance?.name ?? '').toUpperCase()],
      ['RIF:', budget.insurance?.rif ?? ''],
    ] as Array<[string, string]>
  ).forEach(([label, value], i) => {
    const r = 3 + i;
    cell(doc, grid, r, 0, label, { size: 12, bold: true });
    cell(doc, grid, r, 1, value, { size: 12, bold: true });
  });

  drawTitle(doc, grid, 7);

  // R9..R11 — Datos del paciente.
  (
    [
      ['PACIENTE:', data.patientName],
      ['CEDULA :', data.patientId],
      ['TELEFONO:', data.patientPhone],
    ] as Array<[string, string]>
  ).forEach(([label, value], i) => {
    const r = 9 + i;
    cell(doc, grid, r, 1, label, { size: 11, bold: true });
    cell(doc, grid, r, 2, value, { size: 11 });
  });

  // R13..R15 — Encabezado de la tabla.
  cell(doc, grid, 13, 2, ' PROCEDIMIENTOS A REALIZAR :', {
    size: 11,
    bold: true,
  });
  rowRule(doc, grid, 14);
  cell(doc, grid, 15, 1, 'ESTUDIOS ', { size: 11, bold: true });
  cell(doc, grid, 15, 3, 'COSTOS $', { size: 11, bold: true, align: 'center' });

  const detailStart = 17;
  data.lines.forEach((line, i) => {
    const r = detailStart + i;
    cell(doc, grid, r, 1, line.name, { size: 11, spanTo: 2 });
    cell(doc, grid, r, 3, formatMoney(line.totalUsd), {
      size: 11,
      align: 'center',
    });
  });
  const detailEnd = detailStart + Math.max(data.lines.length, 1);
  rowRule(doc, grid, detailEnd);

  // Totales en la fila detailEnd+2, como la hoja.
  let totalRow = detailEnd + 2;
  const adjustmentUsd = +(data.totalUsd - data.linesTotalUsd).toFixed(2);
  const total = (label: string, value: number) => {
    cell(doc, grid, totalRow, 1, label, { size: 11, bold: true });
    cell(doc, grid, totalRow, 3, formatMoney(value), {
      size: 11,
      align: 'center',
    });
    totalRow += 1;
  };
  if (adjustmentUsd !== 0) {
    total('SUB-TOTAL $', data.linesTotalUsd);
    total(adjustmentUsd < 0 ? 'DESCUENTO $' : 'RECARGO $', adjustmentUsd);
  }
  total('TOTAL $', data.totalUsd);
  totalRow -= 1;

  // Bloque bancario, tres filas más abajo.
  const bankLines = budgetBankLines(budget, bankName);
  bankLines.forEach((line, i) => {
    cell(doc, grid, totalRow + 3 + i, 1, line, { size: 11, bold: true });
  });

  const footerRow =
    totalRow + 3 + Math.max(bankLines.length, 1) + 1 + SIGNATURE_ROWS;
  await drawFooter(doc, grid, footerRow, data, emuMm(2337399));
  saveAs(doc.output('blob'), `${budgetFileBaseName(budget, 'insurance')}.pdf`);
}

/**
 * Plantilla APS en PDF — la solicitud de servicio del seguro: dos columnas con
 * rejilla completa. Mismas filas y columnas que `downloadBudgetApsXlsx`.
 */
export async function downloadBudgetApsPdf(budget: Budget): Promise<void> {
  const data = await buildBudgetDoc(budget, { includeBs: false });
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const grid = new SheetGrid('aps');
  grid.setRowHeight(1, 38.25);

  const servicio = data.lines.map((l) => l.name).join(' + ');
  const referring = [budget.referringDoctorName, budget.referringSpecialtyName]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' — ');

  const rows: Array<{
    label: string;
    value: string;
    bold?: boolean;
    blue?: boolean;
  }> = [
    { label: 'NOMBRE DEL TITULAR:', value: data.holderName },
    { label: 'NUMERO DE CI:', value: data.holderId },
    { label: 'NOMBRE DEL PACIENTE', value: data.patientName },
    { label: 'NUMERO DE CI:', value: data.patientId },
    { label: 'NO. TELEFONICO DEL PACIENTE', value: data.patientPhone },
    { label: 'DIAGNOSTICO/SINTOMATOLOGIA', value: data.diagnosis },
    { label: 'SERVICIO SOLICITADO:', value: servicio },
    {
      label: 'NOMBRE Y ESPECIALIDAD DEL MEDICO QUE REFIERE:',
      value: referring,
    },
    // El formulario del seguro pide el costo en dólares, sin desglose.
    {
      label: 'COSTO DE LA ATENCION:',
      value: `$${data.totalUsd.toFixed(2)}`,
      blue: true,
    },
    { label: 'COMENTARIO/OBSERVACIONES', value: budget.observations ?? '' },
    { label: 'OPERADOR/CLINICA', value: data.preparedBy, bold: true },
    {
      label: 'TELEFONO DIRECTO CLINICA:',
      value: BUDGET_COMPANY.directPhone,
      bold: true,
    },
  ];
  const noteRow = 3 + rows.length;
  for (let r = 2; r <= noteRow; r++) grid.setRowHeight(r, 25.5);

  /** Recuadro de una fila a lo ancho de B..C, con la línea que las separa. */
  const boxRow = (row: number, split = true) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    const y = grid.top(row);
    const h = grid.height(row);
    doc.rect(grid.x(1), y, grid.xEnd(2) - grid.x(1), h);
    if (split) doc.line(grid.x(2), y, grid.x(2), y + h);
  };

  // R1 — logo de Seguros Altamira + título, dentro del recuadro.
  await drawImage(
    doc,
    IMG.altamira,
    grid.x(1) + emuMm(342899),
    grid.top(1),
    IMG_MM.altamira.w,
    IMG_MM.altamira.h,
  );
  cell(doc, grid, 1, 2, 'SOLICITUD SERVICIO APS', {
    size: 14.5,
    bold: true,
    align: 'center',
    color: APS_BLUE,
    valign: 'top',
  });
  boxRow(1);
  // R2 — fila en blanco, mergeada B:C en la hoja.
  boxRow(2, false);

  rows.forEach((f, i) => {
    const r = 3 + i;
    cell(doc, grid, r, 1, f.label, {
      size: 10,
      bold: true,
      color: f.blue ? APS_BLUE : [0, 0, 0],
      padding: 2,
      valign: 'top',
      wrap: true,
    });
    cell(doc, grid, r, 2, f.value, { size: 10, bold: f.bold, padding: 2 });
    boxRow(r);
  });

  // Última fila — recaudos a anexar, a lo ancho de B:C.
  cell(doc, grid, noteRow, 1, APS_ATTACHMENTS_NOTE, {
    size: 7,
    bold: true,
    spanTo: 2,
    padding: 2,
    valign: 'top',
    wrap: true,
  });
  boxRow(noteRow, false);

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
