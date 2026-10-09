import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatDateOnly } from '@/lib/dates';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Budget, BudgetTemplate } from '../../domain/models/budget';
import {
  APS_ATTACHMENTS_NOTE,
  BUDGET_COMPANY,
  BUDGET_HEADER_FONT,
  BUDGET_HEADER_LINE_BREAK,
  buildBudgetDoc,
  budgetBankLines,
  budgetCompanyHeaderBodyText,
  budgetCompanyHeaderLines,
  budgetFileBaseName,
  SHEET_COLUMNS,
  type BudgetDocData,
  type BudgetDocOptions,
} from './budgetDocument';

const AFMI_BLUE = 'FF002060';
const APS_BLUE = 'FF003895';

/**
 * Imagen de `public/` como buffer. Null si falla: el documento sale sin ella
 * antes que no salir. Se cachea porque un mismo archivo se pide varias veces
 * (logo + sello) y por descarga.
 */
const imageCache = new Map<string, Promise<ArrayBuffer | null>>();
function loadImage(file: string): Promise<ArrayBuffer | null> {
  let hit = imageCache.get(file);
  if (!hit) {
    hit = (async () => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}${file}`);
        if (!resp.ok) return null;
        return await resp.arrayBuffer();
      } catch {
        return null;
      }
    })();
    imageCache.set(file, hit);
  }
  return hit;
}

/**
 * Inserta una imagen en la hoja con el anclaje EXACTO del
 * `PRESUPUESTO EXCEL.xlsx` de la administración: `nativeCol*`/`nativeRow*` van
 * tal cual al XML (en EMU, 1 px = 9525), así que copiar los valores del
 * original reproduce posición y tamaño al pixel.
 *
 * Con `br` el anclaje es de dos celdas (la imagen se estira entre ambas
 * esquinas, como el logo del original); sin él es de una celda y manda `ext`.
 */
async function placeImage(
  ws: ExcelJS.Worksheet,
  file: string,
  extension: 'png' | 'jpeg',
  anchor: {
    tl: { col: number; colOff: number; row: number; rowOff: number };
    br?: { col: number; colOff: number; row: number; rowOff: number };
    /** Tamaño en EMU cuando el anclaje es de una celda. */
    ext?: { cx: number; cy: number };
  },
): Promise<void> {
  const buffer = await loadImage(file);
  if (!buffer) return;
  const imageId = ws.workbook.addImage({ buffer, extension });
  const native = (p: { col: number; colOff: number; row: number; rowOff: number }) => ({
    nativeCol: p.col,
    nativeColOff: p.colOff,
    nativeRow: p.row,
    nativeRowOff: p.rowOff,
  });
  ws.addImage(imageId, {
    tl: native(anchor.tl),
    ...(anchor.br ? { br: native(anchor.br) } : {}),
    ...(anchor.ext
      ? { ext: { width: anchor.ext.cx / EMU_PER_PX, height: anchor.ext.cy / EMU_PER_PX } }
      : {}),
  } as unknown as ExcelJS.ImagePosition);
}

/** English Metric Units por pixel — la unidad del XML de dibujos de Excel. */
const EMU_PER_PX = 9525;

/** Archivos de imagen del formato, extraídos del Excel original de AFMI. */
const IMG = {
  logo: 'presupuesto-logo-afmi.png',
  // PNG con el fondo gris del escaneo ya transparente. El original lo logra
  // con un `clrChange` en el XML del dibujo, que ExcelJS no sabe escribir;
  // resolverlo en la imagen sirve igual para el Excel y para el PDF.
  signature: 'presupuesto-firma-sello.png',
  altamira: 'presupuesto-logo-altamira.jpg',
} as const;

/** Nombre del banco de la cuenta del presupuesto, desde el catálogo. */
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

function saveWorkbook(
  wb: ExcelJS.Workbook,
  budget: Budget,
  template: BudgetTemplate,
): Promise<void> {
  return wb.xlsx.writeBuffer().then((buf) => {
    saveAs(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${budgetFileBaseName(budget, template)}.xlsx`,
    );
  });
}

/**
 * Configura la hoja para imprimir/exportar a PDF en A4.
 *
 * ExcelJS escribe un `<pageSetup>` SIN `paperSize`, y Excel lo interpreta como
 * Carta: maqueta la hoja a 8,5" de ancho y, al exportar a un PDF A4, encoge
 * todo ~5%. El Excel de la administración no trae `pageSetup` y por eso sale
 * a escala 1. Declarando A4 el PDF exportado queda a tamaño real y coincide
 * con el PDF que genera la aplicación.
 */
function setupA4(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    // Una sola página de ancho. El formato de la administración no lo trae y
    // por eso su hoja PACIENTE parte en dos: la columna de los montos acaba
    // impresa en una segunda página. El alto queda libre.
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.7,
      right: 0.7,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
  };
}

/** Escribe valor + estilo en una celda, de forma compacta. */
function put(
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  font: Partial<ExcelJS.Font>,
  align?: Partial<ExcelJS.Alignment>,
  numFmt?: string,
): ExcelJS.Cell {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = font;
  if (align) c.alignment = align;
  if (numFmt) c.numFmt = numFmt;
  return c;
}

/**
 * Línea horizontal a lo ancho de A..`toCol`. Punteada, como las que encierran
 * la tabla de procedimientos en el formato original.
 */
function rule(ws: ExcelJS.Worksheet, row: number, toCol: number): void {
  for (let c = 1; c <= toCol; c++) {
    ws.getCell(row, c).border = {
      bottom: { style: 'dotted', color: { argb: 'FF000000' } },
    };
  }
}

/**
 * Cabecera común de las plantillas PACIENTE y SEGUROS: logo AFMI arriba a la
 * izquierda y el bloque de razón social / RIF / dirección / teléfonos mergeado
 * en C1:C2, calcando el `PRESUPUESTO EXCEL.xlsx` de la administración.
 *
 * El logo va con anclaje de DOS celdas: su tamaño sale de las dos esquinas,
 * no de `ext`. Las esquinas se copian de la hoja correspondiente del original
 * y NO son iguales entre hojas (la columna B mide distinto en cada una), así
 * que cada plantilla pasa las suyas; reutilizar las de PACIENTE en SEGUROS
 * estira el logo a lo alto.
 */
async function writeCompanyHeader(
  ws: ExcelJS.Worksheet,
  logoAnchor: {
    tl: { colOff: number; rowOff: number };
    br: { col: number; colOff: number; row: number; rowOff: number };
  },
): Promise<void> {
  ws.getRow(1).height = 84;
  await placeImage(ws, IMG.logo, 'png', {
    tl: { col: 0, colOff: logoAnchor.tl.colOff, row: 0, rowOff: logoAnchor.tl.rowOff },
    br: logoAnchor.br,
  });
  // Texto enriquecido de dos tramos, como el original: razón social grande y
  // el resto más chico (ver BUDGET_HEADER_FONT).
  ws.mergeCells('C1:C2');
  const c1 = ws.getCell('C1');
  c1.value = {
    richText: [
      {
        text: budgetCompanyHeaderLines()[0],
        font: {
          name: BUDGET_HEADER_FONT.name,
          size: BUDGET_HEADER_FONT.title,
          bold: true,
          color: { argb: 'FF000000' },
        },
      },
      {
        text: BUDGET_HEADER_LINE_BREAK + budgetCompanyHeaderBodyText(),
        font: {
          name: BUDGET_HEADER_FONT.name,
          size: BUDGET_HEADER_FONT.body,
          bold: true,
          color: { argb: 'FF000000' },
        },
      },
    ],
  };
  c1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

/** Título "PRESUPUESTO DE SERVICIOS." centrado en C, en el azul del formato. */
function writeTitle(ws: ExcelJS.Worksheet, row: number): void {
  ws.getRow(row).height = 19.5;
  put(
    ws,
    `C${row}`,
    'PRESUPUESTO DE SERVICIOS.',
    { name: 'Tahoma', size: 16, bold: true, color: { argb: AFMI_BLUE } },
    { horizontal: 'center', vertical: 'middle' },
  );
}

/**
 * Alto de la firma y sello en filas de 15 pt (≈93 px): lo que hay que dejar
 * libre encima del pie para que la imagen no pise los totales.
 */
const SIGNATURE_ROWS = 5;

/**
 * Pie común: la firma y sello escaneados de AFMI, "Elaborado por" (el usuario
 * que creó el presupuesto) y la leyenda "FIRMA Y SELLO".
 *
 * La imagen se ancla en la columna C con el mismo offset del original, y ocupa
 * las {@link SIGNATURE_ROWS} filas anteriores a `row`: por eso el caller deja
 * ese hueco entre los totales y el pie.
 */
async function writeFooter(
  ws: ExcelJS.Worksheet,
  row: number,
  doc: BudgetDocData,
  signatureColOff: number,
): Promise<void> {
  await placeImage(ws, IMG.signature, 'png', {
    tl: {
      col: 2,
      colOff: signatureColOff,
      row: row - 1 - SIGNATURE_ROWS,
      rowOff: 184100,
    },
    ext: { cx: 1457325, cy: 885825 },
  });
  put(
    ws,
    `A${row}`,
    `Elaborado por: ${doc.preparedBy}`,
    { name: 'Tahoma', size: 10 },
    { vertical: 'middle' },
  );
  put(
    ws,
    `C${row + 1}`,
    'FIRMA Y SELLO',
    { name: 'Calibri', size: 11 },
    { horizontal: 'center' },
  );
}

/**
 * Plantilla PACIENTE — el presupuesto que se le entrega al paciente: montos en
 * BOLÍVARES, con el total en $ y la tasa BCV con que se convirtieron al pie.
 *
 * Con `includeBs: false` (o sin tasa que usar) sale en dólares y sin la fila de
 * la tasa: es preferible a imprimir ceros.
 */
export async function downloadBudgetPatientXlsx(
  budget: Budget,
  options: BudgetDocOptions = {},
): Promise<void> {
  const doc = await buildBudgetDoc(budget, options);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('PACIENTE');
  setupA4(ws);

  // Anchos exactos del template.
  // Anchos de SHEET_COLUMNS: los comparte con el PDF para que las dos salidas
  // tengan la misma retícula.
  ws.columns = SHEET_COLUMNS.patient.map((width) => ({ width }));

  const LABEL: Partial<ExcelJS.Font> = { name: 'Calibri', size: 12, bold: true };
  const VALUE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 };
  const BOLD11: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
  };
  const TOTAL: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true };
  const left: Partial<ExcelJS.Alignment> = { vertical: 'middle' };
  const right: Partial<ExcelJS.Alignment> = {
    horizontal: 'right',
    vertical: 'middle',
  };
  const centerMid: Partial<ExcelJS.Alignment> = {
    horizontal: 'center',
    vertical: 'middle',
  };

  // Esquinas del logo en la hoja PACIENTE del original.
  await writeCompanyHeader(ws, {
    tl: { colOff: 85725, rowOff: 323851 },
    br: { col: 1, colOff: 849696, row: 1, rowOff: 38101 },
  });
  writeTitle(ws, 3);

  // R5 — Fecha del presupuesto
  ws.getRow(5).height = 15.75;
  put(ws, 'C5', 'FECHA DEL PRESUPUESTO:', LABEL, right);
  put(ws, 'D5', formatDateOnly(budget.budgetDate), VALUE, right, '@');

  // R7..R10 — Datos del paciente
  const data: Array<[string, string, string | undefined]> = [
    ['PACIENTE:', doc.patientName, undefined],
    ['CEDULA :', doc.patientId, undefined],
    ['DIAGNOSTICO:', doc.diagnosis, undefined],
    ['TELEFONO:', doc.patientPhone, '@'],
  ];
  data.forEach(([label, value, fmt], i) => {
    const r = 7 + i;
    ws.getRow(r).height = 15.75;
    put(ws, `B${r}`, label, LABEL, left);
    put(ws, `C${r}`, value, VALUE, { vertical: 'middle', wrapText: true }, fmt);
  });

  // R12/R13 — Encabezado de la tabla de procedimientos
  put(ws, 'C12', ' PROCEDIMIENTOS A REALIZAR :', BOLD11, left);
  put(
    ws,
    'D13',
    doc.showBs ? 'COSTO BS' : 'COSTO $',
    BOLD11,
    centerMid,
  );
  rule(ws, 14, 4);

  // Detalle — una fila por procedimiento, convertida con la tasa del documento.
  const detailStart = 15;
  doc.lines.forEach((line, i) => {
    const r = detailStart + i;
    // Sin `wrapText`: el nombre del procedimiento desborda hacia la columna C
    // (vacía) en una sola línea, como en el original. Con ajuste de texto la
    // columna B es demasiado angosta y cada nombre se parte en 2-3 renglones.
    put(ws, `B${r}`, line.name, VALUE, { vertical: 'middle' });
    put(
      ws,
      `D${r}`,
      doc.showBs ? +(line.totalUsd * doc.rateBs).toFixed(2) : line.totalUsd,
      VALUE,
      centerMid,
      '#,##0.00',
    );
  });
  // Cierre de la tabla: mínimo 2 filas de aire, como en el formato original.
  const detailEnd = detailStart + Math.max(doc.lines.length, 1);
  rule(ws, detailEnd + 1, 4);

  // Totales — BS / $ / tasa. Sin tasa sólo sale el total en $.
  let r = detailEnd + 4;
  // Con ajuste global el documento imprime SUBTOTAL + DESCUENTO/RECARGO antes
  // del total: de lo contrario las líneas no suman lo que se cobra y el
  // presupuesto no se sostiene frente al paciente.
  const adjustmentUsd = +(doc.totalUsd - doc.linesTotalUsd).toFixed(2);
  const toBs = (usd: number): number =>
    doc.showBs ? +(usd * doc.rateBs).toFixed(2) : usd;
  if (adjustmentUsd !== 0) {
    put(ws, `B${r}`, doc.showBs ? 'SUB-TOTAL BS' : 'SUB-TOTAL $', BOLD11, left);
    put(ws, `D${r}`, toBs(doc.linesTotalUsd), VALUE, right, '#,##0.00');
    r += 1;
    put(
      ws,
      `B${r}`,
      adjustmentUsd < 0 ? 'DESCUENTO' : 'RECARGO',
      BOLD11,
      left,
    );
    put(ws, `D${r}`, toBs(adjustmentUsd), VALUE, right, '#,##0.00');
    r += 1;
  }
  if (doc.showBs) {
    put(ws, `B${r}`, 'TOTAL BS', BOLD11, left);
    put(ws, `D${r}`, toBs(doc.totalUsd), TOTAL, right, '#,##0.00');
    r += 1;
  }
  put(ws, `B${r}`, 'TOTAL $', BOLD11, left);
  put(ws, `D${r}`, doc.totalUsd, TOTAL, right, '#,##0.00');
  if (doc.showBs) {
    r += 1;
    put(ws, `B${r}`, 'TASA Bcv', BOLD11, left);
    put(ws, `D${r}`, doc.rateBs, VALUE, right, '#,##0.00');
  }

  // +SIGNATURE_ROWS: hueco para la firma y sello, que va encima del pie.
  await writeFooter(ws, r + 2 + SIGNATURE_ROWS, doc, 1092389);
  await saveWorkbook(wb, budget, 'patient');
}

/**
 * Plantilla SEGUROS — el presupuesto dirigido a la compañía: montos en DÓLARES
 * y, al pie, la cuenta donde el seguro paga. Sin cuenta elegida el bloque
 * bancario se omite en vez de imprimir datos inventados.
 */
export async function downloadBudgetInsuranceXlsx(
  budget: Budget,
): Promise<void> {
  const doc = await buildBudgetDoc(budget);
  const bankName = await resolveBankName(budget);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('SEGUROS');
  setupA4(ws);

  ws.columns = SHEET_COLUMNS.insurance.map((width) => ({ width }));

  const LABEL12: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 12,
    bold: true,
  };
  const BOLD11: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
  };
  const VALUE: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 };
  const left: Partial<ExcelJS.Alignment> = { vertical: 'middle' };
  const centerMid: Partial<ExcelJS.Alignment> = {
    horizontal: 'center',
    vertical: 'middle',
  };

  // Esquinas del logo en la hoja SEGUROS del original: la columna B es más
  // angosta y el borde inferior cae dentro de la fila 1, no de la 2.
  await writeCompanyHeader(ws, {
    tl: { colOff: 38100, rowOff: 142876 },
    br: { col: 1, colOff: 802071, row: 0, rowOff: 923926 },
  });

  // R3..R5 — A quién va dirigido.
  const header: Array<[string, string]> = [
    ['FECHA:', formatDateOnly(budget.budgetDate)],
    ['PARA: ', (budget.insurance?.name ?? '').toUpperCase()],
    ['RIF:', budget.insurance?.rif ?? ''],
  ];
  header.forEach(([label, value], i) => {
    const r = 3 + i;
    ws.getRow(r).height = 15.75;
    put(ws, `A${r}`, label, LABEL12, left);
    put(ws, `B${r}`, value, LABEL12, { horizontal: 'left', vertical: 'middle' });
  });

  writeTitle(ws, 7);

  // R9..R11 — Datos del paciente.
  const data: Array<[string, string, string | undefined]> = [
    ['PACIENTE:', doc.patientName, undefined],
    ['CEDULA :', doc.patientId, undefined],
    ['TELEFONO:', doc.patientPhone, '@'],
  ];
  data.forEach(([label, value, fmt], i) => {
    const r = 9 + i;
    put(ws, `B${r}`, label, BOLD11, left);
    put(ws, `C${r}`, value, VALUE, { vertical: 'middle', wrapText: true }, fmt);
  });

  // R13..R15 — Encabezado de la tabla.
  put(ws, 'C13', ' PROCEDIMIENTOS A REALIZAR :', BOLD11, left);
  rule(ws, 14, 4);
  put(ws, 'B15', 'ESTUDIOS ', BOLD11, left);
  put(ws, 'D15', 'COSTOS $', BOLD11, centerMid);

  const detailStart = 17;
  doc.lines.forEach((line, i) => {
    const r = detailStart + i;
    // Sin `wrapText`: el nombre del procedimiento desborda hacia la columna C
    // (vacía) en una sola línea, como en el original. Con ajuste de texto la
    // columna B es demasiado angosta y cada nombre se parte en 2-3 renglones.
    put(ws, `B${r}`, line.name, VALUE, { vertical: 'middle' });
    put(ws, `D${r}`, line.totalUsd, VALUE, centerMid, '#,##0.00');
  });
  const detailEnd = detailStart + Math.max(doc.lines.length, 1);
  rule(ws, detailEnd, 4);

  // Con ajuste global, el documento muestra SUB-TOTAL + DESCUENTO/RECARGO: el
  // seguro tiene que poder sumar las líneas y llegar al total.
  let totalRow = detailEnd + 2;
  const adjustmentUsd = +(doc.totalUsd - doc.linesTotalUsd).toFixed(2);
  if (adjustmentUsd !== 0) {
    put(ws, `B${totalRow}`, 'SUB-TOTAL $', BOLD11, left);
    put(ws, `D${totalRow}`, doc.linesTotalUsd, VALUE, centerMid, '#,##0.00');
    totalRow += 1;
    put(
      ws,
      `B${totalRow}`,
      adjustmentUsd < 0 ? 'DESCUENTO $' : 'RECARGO $',
      BOLD11,
      left,
    );
    put(ws, `D${totalRow}`, adjustmentUsd, VALUE, centerMid, '#,##0.00');
    totalRow += 1;
  }
  put(ws, `B${totalRow}`, 'TOTAL $', BOLD11, left);
  put(ws, `D${totalRow}`, doc.totalUsd, VALUE, centerMid, '#,##0.00');

  // Bloque bancario (sólo si el presupuesto tiene cuenta elegida).
  const bankLines = budgetBankLines(budget, bankName);
  bankLines.forEach((text, i) => {
    put(ws, `B${totalRow + 3 + i}`, text, BOLD11, left);
  });

  const footerRow =
    totalRow + 3 + Math.max(bankLines.length, 1) + 2 + SIGNATURE_ROWS;
  await writeFooter(ws, footerRow, doc, 2337399);
  await saveWorkbook(wb, budget, 'insurance');
}

/**
 * Plantilla APS — "SOLICITUD SERVICIO APS", el formulario que pide el seguro
 * (formato Altamira). No es un presupuesto: es la solicitud que lo acompaña,
 * con titular, paciente, diagnóstico, servicio solicitado y costo total.
 */
export async function downloadBudgetApsXlsx(budget: Budget): Promise<void> {
  const doc = await buildBudgetDoc(budget);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AFMI';
  const ws = wb.addWorksheet('APS');
  setupA4(ws);

  ws.columns = SHEET_COLUMNS.aps.map((width) => ({ width }));

  const BLACK = { argb: 'FF000000' };
  const T: Partial<ExcelJS.Border> = { style: 'thin', color: BLACK };
  const box: Partial<ExcelJS.Borders> = {
    top: T,
    bottom: T,
    left: T,
    right: T,
  };
  const LABEL: Partial<ExcelJS.Font> = { name: 'Arial', size: 10, bold: true };
  const LABEL_BLUE: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: APS_BLUE },
  };
  const VALUE: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 10,
    color: { argb: 'FF000000' },
  };
  const VALUE_BOLD: Partial<ExcelJS.Font> = { ...VALUE, bold: true };
  const labelAlign: Partial<ExcelJS.Alignment> = {
    horizontal: 'left',
    vertical: 'top',
    wrapText: true,
  };
  const valueAlign: Partial<ExcelJS.Alignment> = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true,
  };

  const boxRow = (row: number): void => {
    for (let c = 2; c <= 3; c++) ws.getCell(row, c).border = { ...box };
  };

  // R1 — Logo de Seguros Altamira a la izquierda + título, con el mismo
  // anclaje del original (el formulario es de ellos y lleva su marca).
  ws.getRow(1).height = 38.25;
  await placeImage(ws, IMG.altamira, 'jpeg', {
    tl: { col: 1, colOff: 342899, row: 0, rowOff: 1 },
    ext: { cx: 752475, cy: 487048 },
  });
  put(
    ws,
    'C1',
    'SOLICITUD SERVICIO APS',
    { name: 'Tahoma', size: 14.5, bold: true, color: { argb: APS_BLUE } },
    { horizontal: 'center', vertical: 'top', wrapText: true },
  );
  boxRow(1);
  ws.getRow(2).height = 25.5;
  ws.mergeCells('B2:C2');
  boxRow(2);

  // R3..R14 — Un par etiqueta/valor por fila, en el orden del formulario.
  const servicio = doc.lines.map((l) => l.name).join(' + ');
  const referring = [budget.referringDoctorName, budget.referringSpecialtyName]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' — ');
  // El formulario del seguro pide el costo en dólares, sin desglose.
  const costo = `$${doc.totalUsd.toFixed(2)}`;

  const fields: Array<{ label: string; value: string; bold?: boolean; blue?: boolean }> =
    [
      { label: 'NOMBRE DEL TITULAR:', value: doc.holderName },
      { label: 'NUMERO DE CI:', value: doc.holderId },
      { label: 'NOMBRE DEL PACIENTE', value: doc.patientName },
      { label: 'NUMERO DE CI:', value: doc.patientId },
      { label: 'NO. TELEFONICO DEL PACIENTE', value: doc.patientPhone },
      { label: 'DIAGNOSTICO/SINTOMATOLOGIA', value: doc.diagnosis },
      { label: 'SERVICIO SOLICITADO:', value: servicio },
      {
        label: 'NOMBRE Y ESPECIALIDAD DEL MEDICO QUE REFIERE:',
        value: referring,
      },
      { label: 'COSTO DE LA ATENCION:', value: costo, blue: true },
      { label: 'COMENTARIO/OBSERVACIONES', value: budget.observations ?? '' },
      { label: 'OPERADOR/CLINICA', value: doc.preparedBy, bold: true },
      {
        label: 'TELEFONO DIRECTO CLINICA:',
        value: BUDGET_COMPANY.directPhone,
        bold: true,
      },
    ];

  fields.forEach((f, i) => {
    const r = 3 + i;
    ws.getRow(r).height = 25.5;
    put(ws, `B${r}`, f.label, f.blue ? LABEL_BLUE : LABEL, labelAlign);
    put(ws, `C${r}`, f.value, f.bold ? VALUE_BOLD : VALUE, valueAlign);
    boxRow(r);
  });

  // Última fila — recaudos a anexar, mergeada a lo ancho del formulario.
  const noteRow = 3 + fields.length;
  ws.getRow(noteRow).height = 25.5;
  ws.mergeCells(`B${noteRow}:C${noteRow}`);
  put(
    ws,
    `B${noteRow}`,
    APS_ATTACHMENTS_NOTE,
    { name: 'Tahoma', size: 7, bold: true },
    labelAlign,
  );
  boxRow(noteRow);

  await saveWorkbook(wb, budget, 'aps');
}

/** Descarga la plantilla pedida en Excel. */
export function downloadBudgetXlsx(
  budget: Budget,
  template: BudgetTemplate,
  options: BudgetDocOptions = {},
): Promise<void> {
  switch (template) {
    case 'patient':
      return downloadBudgetPatientXlsx(budget, options);
    case 'insurance':
      return downloadBudgetInsuranceXlsx(budget);
    case 'aps':
      return downloadBudgetApsXlsx(budget);
  }
}
