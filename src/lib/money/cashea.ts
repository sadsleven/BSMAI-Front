/**
 * Desglose Cashea en centavos enteros (redondeo mitad-arriba). Montos en USD,
 * tasas como fracción 0..1. Cálculo exacto para evitar el drift de punto
 * flotante de `Number.toFixed` (que trunca el medio-centavo hacia abajo).
 *
 * La INICIAL la cobra el comercio del titular en el Paso 1 y NO genera comisión
 * propia. Espeja `ar-targets.ts` del backend:
 *   restante       = total − inicial
 *   comisión       = total × commissionRate
 *   financiamiento = restante × financingRate
 *   neto (CxC)     = restante − comisión − financiamiento
 */
export interface CasheaBreakdownCents {
  /** Restante = total − inicial, en centavos. */
  remainingCents: number;
  /** Comisión = total × commissionRate, en centavos. */
  commissionCents: number;
  /** Financiamiento = restante × financingRate, en centavos. */
  financingCents: number;
  /** Neto a recibir por Cashea = restante − comisión − financiamiento, en centavos. */
  netCents: number;
}

export function casheaBreakdownCents(
  total: number,
  initial: number,
  commissionRate: number,
  financingRate: number,
): CasheaBreakdownCents {
  const totalCents = Math.round(total * 100);
  const initialCents = Math.round(initial * 100);
  const remainingCents = Math.max(0, totalCents - initialCents);
  const rc = Math.round(commissionRate * 10000);
  const rf = Math.round(financingRate * 10000);
  const commissionCents = Math.round((totalCents * rc) / 10000);
  const financingCents = Math.round((remainingCents * rf) / 10000);
  const netCents = Math.max(
    0,
    remainingCents - commissionCents - financingCents,
  );
  return { remainingCents, commissionCents, financingCents, netCents };
}
