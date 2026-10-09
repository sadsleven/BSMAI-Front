import { holderDisplayName } from '@/modules/orders/domain/models/order';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { Budget, BudgetTemplate } from '../../domain/models/budget';
import {
  BUDGET_TEMPLATE_LABEL,
  budgetDiagnosisText,
  budgetLinesTotalUsd,
} from '../../domain/models/budget';

/**
 * Cabecera que AFMI imprime en los PRESUPUESTOS. Es la del formato que usa la
 * administración (`PRESUPUESTO_EXCEL.xlsx`) y NO coincide con la de las
 * órdenes internas / facturas (`orderExcel.ts`): esa lleva la dirección de la
 * oficina y otro teléfono. Se mantiene aparte a propósito — cambiar una no
 * debe cambiar la otra sin que alguien lo decida.
 */
export const BUDGET_COMPANY = {
  name: 'ATENCION FAMILIAR MEDICO INTEGRAL, CA',
  rif: 'J-50190282-8',
  addressLine1: 'Calle Bomplant EDIF. Coromoto, Planta Baja',
  // Sin espacio antes de "Sucre", como el original: con él la línea ya no
  // entra en el ancho de la columna y la cabecera se parte en dos.
  addressLine2: 'Locales N° 08 y 09, Sector Gran Mariscal. Cumaná Edo.Sucre',
  phones: '(0293)4322586 - (0412)6944464',
  /** Teléfono directo de la clínica que pide la solicitud APS. */
  directPhone: '0293-4322586 / 0412-6944464',
};

/** Las cinco líneas de la cabecera, de arriba abajo. */
export function budgetCompanyHeaderLines(): string[] {
  return [
    BUDGET_COMPANY.name,
    `RIF ${BUDGET_COMPANY.rif}`,
    BUDGET_COMPANY.addressLine1,
    BUDGET_COMPANY.addressLine2,
    `Teléfonos: ${BUDGET_COMPANY.phones}`,
  ];
}

/**
 * Tamaños de la cabecera: la razón social va más grande que el resto. Es lo
 * que hace el original y no es cosmético — a 11 pt la línea de la dirección no
 * entra en el ancho de la columna y la cabecera se parte en un renglón de más.
 */
export const BUDGET_HEADER_FONT = { name: 'Calibri', title: 11, body: 9 };

/**
 * Relleno que separa las líneas de la cabecera en la celda del Excel. El
 * espacio es mucho más angosto que una letra, así que para garantizar el salto
 * hace falta un run bastante más largo que el ancho de la columna en
 * caracteres (~58): con 70 todavía cabían dos líneas en el mismo renglón.
 */
const HEADER_LINE_BREAK = ' '.repeat(150);

/**
 * Las 4 líneas que van bajo la razón social, como UN texto para la celda
 * mergeada del Excel. Se separan con un run de espacios en vez de con `\n`
 * —igual que el original—: el relleno fuerza el salto y Excel descarta los
 * espacios sobrantes al final de cada renglón.
 */
export function budgetCompanyHeaderBodyText(): string {
  return budgetCompanyHeaderLines().slice(1).join(HEADER_LINE_BREAK);
}

/** El mismo relleno, para separar la razón social del resto de la cabecera. */
export const BUDGET_HEADER_LINE_BREAK = HEADER_LINE_BREAK;

/** Nota al pie de la solicitud APS (lista de recaudos). */
export const APS_ATTACHMENTS_NOTE =
  'ANEXAR LOS SIGUIENTES DOCUMENTOS: COPIA DE LA C.I., COPIA DE LA PARTIDA DE NACIMIENTO (MENORES DE EDAD), INFORME MEDICO, RECIPES MEDICOS, PRESUPUESTO';

export function holderId(
  p?: { cedula?: string | null; rif?: string | null } | null,
): string {
  if (!p) return '';
  return p.cedula ?? p.rif ?? '';
}

/** Sanitiza un string para usarlo como nombre de archivo. */
export function safeFilenameSegment(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .trim()
      .slice(0, 80) || 'sin_nombre'
  );
}

/**
 * Nombre de archivo: `{N° de presupuesto} {PACIENTE} {PLANTILLA}`
 * (ej. `P-00123 JUANA PEREZ SEGURO`). La plantilla va en el nombre porque del
 * mismo presupuesto se descargan varias versiones a la misma carpeta.
 */
export function budgetFileBaseName(
  budget: Budget,
  template: BudgetTemplate,
): string {
  const patient = holderDisplayName(budget.patient).toUpperCase();
  const tpl = { patient: 'PACIENTE', insurance: 'SEGURO', aps: 'APS' }[template];
  return safeFilenameSegment(`${budget.budgetNumber} ${patient} ${tpl}`.trim());
}

/** Quién elabora el documento: grado académico + nombre del usuario creador. */
export function budgetPreparedBy(budget: Budget): string {
  const cb = budget.createdBy;
  if (!cb) return '';
  return [cb.academicDegree?.trim(), cb.firstName?.trim(), cb.lastName?.trim()]
    .filter(Boolean)
    .join(' ');
}

export interface BudgetDocLine {
  /** Nombre impreso del procedimiento, con su cantidad cuando es > 1. */
  name: string;
  qty: number;
  unitUsd: number;
  totalUsd: number;
}

/** Opciones de armado del documento que elige quien descarga. */
export interface BudgetDocOptions {
  /**
   * Imprimir los montos en bolívares en la plantilla PACIENTE (default: sí).
   * En `false` el documento sale en dólares y sin la fila "TASA Bcv".
   */
  includeBs?: boolean;
}

export interface BudgetDocData {
  lines: BudgetDocLine[];
  /** Total impreso en USD: el monto del presupuesto (con su ajuste). */
  totalUsd: number;
  /** Suma de las líneas. Difiere de `totalUsd` cuando hay ajuste global. */
  linesTotalUsd: number;
  /**
   * Tasa USD/Bs del documento. Sale del snapshot del presupuesto; sin él, de
   * la tasa vigente a la fecha del presupuesto. 0 ⇒ no se pudo resolver.
   */
  rateBs: number;
  /**
   * ¿La plantilla PACIENTE imprime los montos en bolívares? Es la opción que
   * se elige al descargar, y cae a `false` sola cuando no hay tasa que usar.
   * En `false` el documento va en dólares y sin la fila de la tasa.
   */
  showBs: boolean;
  patientName: string;
  patientId: string;
  patientPhone: string;
  holderName: string;
  holderId: string;
  diagnosis: string;
  preparedBy: string;
}

/**
 * Tasa USD/Bs del presupuesto. Precedencia:
 *  1. La tasa elegida al guardar (`exchangeRate`): el presupuesto entregado no
 *     cambia de precio porque la del día siguiente sea otra.
 *  2. La vigente a la fecha del presupuesto (presupuestos guardados sin tasa).
 *  3. 0 — sin acceso a tasas; la plantilla en Bs sale sin convertir.
 */
export async function resolveBudgetRateBs(budget: Budget): Promise<number> {
  if (budget.exchangeRate) {
    const snap = Number(budget.exchangeRate.amountBs) || 0;
    if (snap > 0) return snap;
  }
  try {
    const { data } = await exchangeRateGateway.list({
      currency: 'USD',
      effectiveDateTo: budget.budgetDate,
      isActive: true,
      sortBy: 'effectiveDate',
      sortDir: 'DESC',
      page: 1,
      limit: 1,
    });
    return Number(data[0]?.amountBs) || 0;
  } catch {
    return 0;
  }
}

/**
 * Datos ya derivados del presupuesto, compartidos por el Excel y el PDF de las
 * tres plantillas: lo que se imprime se calcula UNA vez y ambos formatos salen
 * idénticos.
 *
 * El total impreso es `priceAmount` (el ajustado), no la suma de las líneas:
 * si el usuario aplicó un descuento global, el documento debe cobrar eso.
 */
export async function buildBudgetDoc(
  budget: Budget,
  options: BudgetDocOptions = {},
): Promise<BudgetDocData> {
  const rows = [...(budget.budgetServiceTypes ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const lines: BudgetDocLine[] = rows.map((r) => {
    const qty = Math.max(1, Math.trunc(r.quantity ?? 1));
    const unit = Number(r.unitPriceUsd) || 0;
    const base = (r.customName?.trim() || r.serviceType?.name || '').toUpperCase();
    return {
      name: qty > 1 ? `${base} (x${qty})` : base,
      qty,
      unitUsd: unit,
      totalUsd: +(unit * qty).toFixed(2),
    };
  });

  // La tasa sólo se consulta si el documento la va a usar.
  const wantsBs = options.includeBs ?? true;
  const rateBs = wantsBs ? await resolveBudgetRateBs(budget) : 0;

  return {
    lines,
    totalUsd: Number(budget.priceAmount) || 0,
    linesTotalUsd: budgetLinesTotalUsd(budget),
    rateBs,
    showBs: wantsBs && rateBs > 0,
    patientName: holderDisplayName(budget.patient).toUpperCase(),
    patientId: holderId(budget.patient),
    patientPhone: budget.patient?.phones?.[0]?.number ?? '',
    holderName: holderDisplayName(budget.holder).toUpperCase(),
    holderId: holderId(budget.holder),
    diagnosis: budgetDiagnosisText(budget).toUpperCase(),
    preparedBy: budgetPreparedBy(budget),
  };
}

/**
 * Bloque bancario de la plantilla SEGUROS, armado desde la cuenta elegida.
 * Vacío cuando el presupuesto no tiene cuenta: el documento sale sin el bloque
 * en vez de imprimir una cuenta inventada.
 */
export function budgetBankLines(budget: Budget, bankName: string): string[] {
  const pa = budget.paymentAccount;
  if (!pa) return [];
  const out = [pa.accountHolderName?.trim() || BUDGET_COMPANY.name];
  out.push('CUENTA CORRIENTE');
  if (bankName) out.push(`BANCO: ${bankName}`);
  out.push(`RIF: ${pa.idDocument?.trim() || BUDGET_COMPANY.rif}`);
  if (pa.accountNumber) out.push(`N° DE CUENTA= ${pa.accountNumber}`);
  return out;
}

/** Etiqueta de la plantilla, para menús y toasts. */
export function budgetTemplateLabel(template: BudgetTemplate): string {
  return BUDGET_TEMPLATE_LABEL[template];
}
