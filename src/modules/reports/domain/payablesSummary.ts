import type { ReportPayableRow } from '../infrastructure/reportsGateway';

/** Una línea del cuadro resumen de cuentas por pagar. */
export interface PayableProviderSummary {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string | null;
  name: string;
  /** Órdenes incluidas (renglones del listado). */
  ordersCount: number;
  /** Bruto USD de todas las obligaciones del proveedor. */
  grossUsd: number;
  /** Σ USD ya abonados a ese proveedor. */
  paidUsd: number;
  /** Lo que falta pagarle: bruto de lo no pagado menos lo ya abonado. */
  pendingUsd: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Clave de agrupación: el proveedor, no el renglón. */
export function payableProviderKey(r: ReportPayableRow): string {
  return `${r.providerType}:${r.providerId ?? r.providerName}`;
}

/**
 * Saldo pendiente en USD de un conjunto de obligaciones: el bruto de las que
 * aún no están pagadas, menos lo ya abonado de los lotes con pago parcial.
 * Los abonos son del LOTE, así que se cuentan una sola vez aunque el lote
 * tenga varias órdenes en el listado.
 */
export function pendingUsdOf(rows: ReportPayableRow[]): number {
  let gross = 0;
  const coveredByBatch = new Map<string, number>();
  for (const r of rows) {
    if (r.state !== 'paid') gross += r.grossUsd ?? 0;
    if (r.payableId && r.state === 'partially_paid')
      coveredByBatch.set(r.payableId, r.payableCoveredUsd ?? 0);
  }
  let abonado = 0;
  for (const v of coveredByBatch.values()) abonado += v;
  return Math.max(0, round2(gross - abonado));
}

/** Σ USD abonados de un conjunto de obligaciones (una vez por lote). */
export function paidUsdOf(rows: ReportPayableRow[]): number {
  const coveredByBatch = new Map<string, number>();
  for (const r of rows) {
    if (r.payableId) coveredByBatch.set(r.payableId, r.payableCoveredUsd ?? 0);
  }
  let total = 0;
  for (const v of coveredByBatch.values()) total += v;
  return round2(total);
}

/**
 * Cuadro resumen: cuánto se le debe a cada proveedor, de mayor a menor. Se
 * calcula sobre las MISMAS filas que muestra el detalle, así que respeta los
 * filtros activos sin pedirle nada más al backend.
 */
export function payablesSummaryByProvider(
  rows: ReportPayableRow[],
): PayableProviderSummary[] {
  const groups = new Map<string, ReportPayableRow[]>();
  for (const r of rows) {
    const key = payableProviderKey(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const first = list[0];
      let grossUsd = 0;
      for (const r of list) grossUsd += r.grossUsd ?? 0;
      return {
        key,
        providerType: first.providerType,
        providerId: first.providerId,
        name: first.providerName,
        ordersCount: list.length,
        grossUsd: round2(grossUsd),
        paidUsd: paidUsdOf(list),
        pendingUsd: pendingUsdOf(list),
      };
    })
    .sort((a, b) => b.pendingUsd - a.pendingUsd || b.grossUsd - a.grossUsd);
}
