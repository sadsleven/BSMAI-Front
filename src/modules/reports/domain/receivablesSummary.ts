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
  /**
   * El mismo monto reexpresado a la tasa de HOY. En las órdenes indexadas
   * coincide con el facturado (el dólar manda). En las de tasa fija el lote
   * quedó amarrado a bolívares, así que se convierten esos Bs a la tasa
   * vigente: es lo que realmente vale hoy ese cobro.
   */
  updatedUsd: number;
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

/** Monto de una fila llevado a la tasa de hoy (ver `updatedUsd`). */
export function receivableUpdatedUsd(
  r: ReportReceivableRow,
  currentRateBs: number | null,
): number {
  if (r.useFixedRate && r.targetBs != null && currentRateBs)
    return r.targetBs / currentRateBs;
  return receivableAmounts(r, currentRateBs).usd;
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
    const updatedUsd = receivableUpdatedUsd(r, currentRateBs);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.usd += usd;
      g.updatedUsd += updatedUsd;
    } else {
      groups.set(key, {
        key,
        name: r.debtorName,
        type: r.debtorType,
        count: 1,
        usd,
        updatedUsd,
      });
    }
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, usd: round2(g.usd), updatedUsd: round2(g.updatedUsd) }))
    .sort((a, b) => b.usd - a.usd);
}

/** Totales del pie del cuadro resumen. */
export function receivablesSummaryTotals(
  debtors: ReceivableDebtorSummary[],
): { usd: number; updatedUsd: number } {
  let usd = 0;
  let updatedUsd = 0;
  for (const d of debtors) {
    usd += d.usd;
    updatedUsd += d.updatedUsd;
  }
  return { usd: round2(usd), updatedUsd: round2(updatedUsd) };
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
