/**
 * Comisión Cashea en centavos enteros (redondeo mitad-arriba). Montos en USD,
 * tasas como fracción 0..1. Cálculo exacto para evitar el drift de punto
 * flotante de `Number.toFixed` (que trunca el medio-centavo hacia abajo).
 *
 * Espeja `casheaCommissionForOrder` del backend:
 *   comisiónCents = round((primeraCuotaCents·r1 + precioCents·r2) / 10000).
 */
export function casheaCommissionCents(
  firstAmount: number,
  price: number,
  firstRate: number,
  totalRate: number,
): number {
  const firstCents = Math.round(firstAmount * 100);
  const priceCents = Math.round(price * 100);
  const r1 = Math.round(firstRate * 10000);
  const r2 = Math.round(totalRate * 10000);
  return Math.round((firstCents * r1 + priceCents * r2) / 10000);
}
