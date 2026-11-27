import type { ReportReceivableRow } from '../infrastructure/reportsGateway';

/** Una línea del cuadro resumen de cuentas por cobrar. */
export interface ReceivableDebtorSummary {
  key: string;
  name: string;
  type: 'insurance' | 'holder';
  /** Renglones del listado (una orden mixta emite dos). */
  count: number;
  /** Monto facturado en USD. */
  usd: number;
  /** USD cobrados: pagos de los lotes (los lotes fijos convierten sus Bs a la tasa del lote). */
  collectedUsd: number;
  /** Lo que falta por cobrar: facturado − pagos de los lotes. */
  pendingUsd: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Clave de agrupación: el deudor (seguro o titular), no la orden. */
export function receivableDebtorKey(r: ReportReceivableRow): string {
  return `${r.debtorType}:${r.debtorId ?? r.debtorName}`;
}

/**
 * Monto $, tasa y Bs de una fila según su modo de cobro.
 *
 * - Tasa fija: mandan los bolívares del lote y su propia tasa; el USD se
 *   deriva de ahí (no del `targetUsd`, que puede haber quedado viejo).
 * - Indexada: manda el USD y los bolívares salen de la tasa vigente.
 */
export function receivableAmounts(
  r: ReportReceivableRow,
  currentRateBs: number | null,
): { usd: number; rate: number | null; bs: number | null } {
  if (r.useFixedRate) {
    const rate = r.rateBs && r.rateBs > 0 ? r.rateBs : null;
    const bs = r.targetBs ?? null;
    const usd = bs != null && rate ? bs / rate : (r.targetUsd ?? 0);
    return { usd, rate, bs };
  }
  const usd = r.targetUsd ?? 0;
  const rate = currentRateBs && currentRateBs > 0 ? currentRateBs : null;
  const bs = rate != null ? usd * rate : null;
  return { usd, rate, bs };
}

/**
 * Monto $, tasa y Bs usando la tasa de la FACTURA cuando existe. Para reportes
 * estáticos (Excel y tabla) que deben reflejar los valores al momento de la
 * emisión, no la revaluación a la tasa vigente.
 *
 * - Tasa fija: igual que `receivableAmounts`.
 * - Indexada: usa `r.rateBs` (tasa de la factura) en vez de la tasa actual.
 */
export function receivableAmountsAtInvoiceRate(
  r: ReportReceivableRow,
  fallbackRateBs: number | null,
): { usd: number; rate: number | null; bs: number | null } {
  const invoiceRate = r.rateBs && r.rateBs > 0 ? r.rateBs : null;
  const rate = invoiceRate ?? (fallbackRateBs && fallbackRateBs > 0 ? fallbackRateBs : null);
  if (r.useFixedRate) {
    const bs = r.targetBs ?? null;
    const usd = bs != null && rate ? bs / rate : (r.targetUsd ?? 0);
    return { usd, rate, bs };
  }
  const usd = r.targetUsd ?? 0;
  const bs = rate != null ? usd * rate : null;
  return { usd, rate, bs };
}

/**
 * USD cobrados de una fila. Los pagos vienen por LOTE y el backend sólo los
 * imprime en la primera fila de cada lote. En lotes de tasa fija los cobros
 * se registran en Bs (`collectedBs`): se convierten a USD a la tasa del lote
 * (su `rateBs`), no a la de hoy — el cobro ya ocurrió a esa tasa.
 */
export function collectedUsdOf(
  r: ReportReceivableRow,
  currentRateBs: number | null,
): number {
  if (r.useFixedRate && (r.collectedBs ?? 0) > 0) {
    const rate = r.rateBs && r.rateBs > 0 ? r.rateBs : currentRateBs;
    return rate && rate > 0 ? (r.collectedBs ?? 0) / rate : 0;
  }
  return r.collectedUsd ?? 0;
}

/**
 * Cuadro resumen: cuánto debe cada seguro o titular, de mayor a menor. Lo usan
 * la pestaña Resumen en pantalla y la primera hoja del Excel, para que los dos
 * muestren exactamente los mismos números.
 */
export function receivablesSummaryByDebtor(
  rows: ReportReceivableRow[],
  currentRateBs: number | null,
): ReceivableDebtorSummary[] {
  const groups = new Map<string, ReceivableDebtorSummary>();
  for (const r of rows) {
    const key = receivableDebtorKey(r);
    const usd = receivableAmounts(r, currentRateBs).usd;
    const collectedUsd = collectedUsdOf(r, currentRateBs);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.usd += usd;
      g.collectedUsd += collectedUsd;
    } else {
      groups.set(key, {
        key,
        name: r.debtorName,
        type: r.debtorType,
        count: 1,
        usd,
        collectedUsd,
        pendingUsd: 0,
      });
    }
  }
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      usd: round2(g.usd),
      collectedUsd: round2(g.collectedUsd),
      // Lo que falta: facturado − pagos de los lotes (nunca negativo).
      pendingUsd: Math.max(0, round2(g.usd - g.collectedUsd)),
    }))
    .sort((a, b) => b.usd - a.usd);
}

/** Totales del pie del cuadro resumen. */
export function receivablesSummaryTotals(
  debtors: ReceivableDebtorSummary[],
): { usd: number; collectedUsd: number; pendingUsd: number } {
  let usd = 0;
  let collectedUsd = 0;
  let pendingUsd = 0;
  for (const d of debtors) {
    usd += d.usd;
    collectedUsd += d.collectedUsd;
    pendingUsd += d.pendingUsd;
  }
  return {
    usd: round2(usd),
    collectedUsd: round2(collectedUsd),
    pendingUsd: round2(pendingUsd),
  };
}

/**
 * Claves de las filas que llevan impreso el COSTO. El costo es por ORDEN: una
 * orden mixta emite dos renglones (porción fija e indexada) con el mismo
 * costo, así que sólo se imprime en el primero para no duplicarlo.
 */
export function costRowKeys(rows: ReportReceivableRow[]): Set<string> {
  const seenOrders = new Set<string>();
  const keys = new Set<string>();
  for (const r of rows) {
    if (seenOrders.has(r.orderId)) continue;
    seenOrders.add(r.orderId);
    keys.add(`${r.orderId}-${r.portion}`);
  }
  return keys;
}
