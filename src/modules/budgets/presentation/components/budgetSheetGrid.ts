import type { jsPDF } from 'jspdf';
import type { BudgetTemplate } from '../../domain/models/budget';
import { SHEET_COLUMNS, excelColPx } from './budgetDocument';

/** 1 píxel de Excel (96 dpi) en milímetros. */
const PX_MM = 25.4 / 96;
/** 1 punto tipográfico en milímetros. */
export const PT_MM = 25.4 / 72;

/** Alto por defecto de una fila de Excel, en puntos. */
const DEFAULT_ROW_PT = 15;

/**
 * Excel no imprime las filas a su alto nominal: una de 15 pt sale a ~14,55 pt
 * en el PDF (y una de 15,75 a ~15,24). El factor es constante, así que se
 * aplica aquí para que el PDF propio tenga el mismo paso de fila que el que
 * sale de exportar la hoja. Medido comparando ambos PDF.
 */
const ROW_PRINT_SCALE = 0.9676;

/**
 * Márgenes de impresión por defecto de Excel (0,7" a los lados y 0,75" arriba).
 * Son los que aplica al exportar la hoja a PDF, así que el PDF propio arranca
 * en el mismo sitio.
 */
const MARGIN_L_MM = 0.7 * 25.4;
const MARGIN_T_MM = 0.75 * 25.4;

/**
 * Retícula fila/columna de una hoja del presupuesto, en milímetros.
 *
 * El PDF descargado y el PDF que sale de exportar el Excel tienen que verse
 * iguales. La manera de garantizarlo no es ajustar márgenes a ojo, sino dibujar
 * el PDF sobre LA MISMA retícula que la hoja: mismas columnas (de
 * {@link SHEET_COLUMNS}), mismas alturas de fila y mismos márgenes de
 * impresión. Así cada texto cae donde caería su celda.
 *
 * Las filas se numeran 1-based, como en Excel; las columnas 0-based
 * (0 = A), que es como las indexa ExcelJS.
 */
export class SheetGrid {
  private readonly colLeft: number[] = [];
  private readonly colWidth: number[] = [];
  /** Alto en puntos de las filas que no usan el alto por defecto. */
  private readonly rowPt = new Map<number, number>();

  constructor(template: BudgetTemplate) {
    let x = MARGIN_L_MM;
    for (const chars of SHEET_COLUMNS[template]) {
      const w = excelColPx(chars) * PX_MM;
      this.colLeft.push(x);
      this.colWidth.push(w);
      x += w;
    }
  }

  /** Borde izquierdo de la columna (0 = A). */
  x(col: number): number {
    return this.colLeft[col];
  }

  /** Borde derecho de la columna. */
  xEnd(col: number): number {
    return this.colLeft[col] + this.colWidth[col];
  }

  /** Centro horizontal de la columna. */
  xMid(col: number): number {
    return this.colLeft[col] + this.colWidth[col] / 2;
  }

  /** Borde derecho de la última columna: el ancho útil de la hoja. */
  get right(): number {
    return this.xEnd(this.colLeft.length - 1);
  }

  /** Fija el alto de una fila, en puntos (como `ws.getRow(n).height`). */
  setRowHeight(row: number, heightPt: number): this {
    this.rowPt.set(row, heightPt);
    return this;
  }

  /** Borde superior de la fila (1-based). */
  top(row: number): number {
    let y = MARGIN_T_MM;
    for (let r = 1; r < row; r++) {
      y += (this.rowPt.get(r) ?? DEFAULT_ROW_PT) * ROW_PRINT_SCALE * PT_MM;
    }
    return y;
  }

  /** Alto de la fila en milímetros. */
  height(row: number): number {
    return (this.rowPt.get(row) ?? DEFAULT_ROW_PT) * ROW_PRINT_SCALE * PT_MM;
  }

  /** Borde inferior de la fila. */
  bottom(row: number): number {
    return this.top(row) + this.height(row);
  }

  /**
   * Línea base del texto dentro de la fila.
   *
   * Los factores salen de medir dónde cae el texto en el PDF que exporta
   * Excel: con alineación vertical centrada la base queda ~0,70 del tamaño de
   * fuente por debajo del centro de la fila; con alineación superior, a ~1,0
   * del borde de arriba.
   */
  baseline(row: number, fontPt: number, valign: 'middle' | 'top' = 'middle'): number {
    const f = fontPt * PT_MM;
    return valign === 'top'
      ? this.top(row) + f * 1.0
      : this.top(row) + this.height(row) / 2 + f * 0.7;
  }
}

/** Alineación horizontal del texto dentro de su celda. */
export type CellAlign = 'left' | 'center' | 'right';

/**
 * Escribe un texto en la celda (fila, columna) con el estilo dado. Espeja el
 * helper `put` del generador de Excel para que ambos se lean igual.
 */
export function cell(
  doc: jsPDF,
  grid: SheetGrid,
  row: number,
  col: number,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    align?: CellAlign;
    color?: [number, number, number];
    /** Columna hasta la que se extiende la celda para centrar o alinear. */
    spanTo?: number;
    /** Sangría desde el borde de la celda, en mm. */
    padding?: number;
    /** Alineación vertical dentro de la fila. */
    valign?: 'middle' | 'top';
    /** Parte el texto en varias líneas si no entra en la celda. */
    wrap?: boolean;
  } = {},
): void {
  const {
    size = 11,
    bold = false,
    align = 'left',
    color = [0, 0, 0],
    spanTo = col,
    padding = 1,
    valign = 'middle',
    wrap = false,
  } = opts;
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const left = grid.x(col) + padding;
  const right = grid.xEnd(spanTo) - padding;
  const x = align === 'left' ? left : align === 'right' ? right : (left + right) / 2;
  const jsAlign = align === 'center' ? 'center' : align;
  if (!wrap) {
    doc.text(text, x, grid.baseline(row, size, valign), { align: jsAlign });
    doc.setTextColor(0, 0, 0);
    return;
  }
  // Varias líneas: el bloque arranca arriba y crece hacia abajo, como una
  // celda de Excel con ajuste de texto.
  const lines = doc.splitTextToSize(text, right - left) as string[];
  const lineH = size * PT_MM * 1.2;
  let y = grid.baseline(row, size, 'top');
  for (const line of lines) {
    doc.text(line, x, y, { align: jsAlign });
    y += lineH;
  }
  doc.setTextColor(0, 0, 0);
}

/**
 * Línea punteada al pie de una fila, a lo ancho de la hoja. Espeja el helper
 * `rule` del Excel, que pone un borde inferior punteado en A..D.
 */
export function rowRule(doc: jsPDF, grid: SheetGrid, row: number): void {
  doc.saveGraphicsState();
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([0.5, 0.7], 0);
  const y = grid.bottom(row);
  doc.line(grid.x(0), y, grid.right, y);
  doc.setLineDashPattern([], 0);
  doc.restoreGraphicsState();
}
