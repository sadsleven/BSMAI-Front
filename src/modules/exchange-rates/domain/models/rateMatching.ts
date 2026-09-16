import type { ExchangeRate } from './exchangeRate';

/** Zona horaria de negocio: las tasas BCV son "del día" en Venezuela. */
const BUSINESS_TZ = 'America/Caracas';

/** `YYYY-MM-DD` de un instante en la zona de negocio (America/Caracas). */
export function businessDayKey(d: Date): string {
  // en-CA formatea como YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
}

export type UsdRateForEurMatch = {
  rate: ExchangeRate;
  /** `true` si la tasa USD es del mismo día (Caracas) que la tasa EUR. */
  sameDay: boolean;
};

/**
 * Elige la tasa USD/Bs con la que cruzar una tasa EUR/Bs (EUR → Bs → USD): la
 * del MISMO DÍA (Caracas) que la tasa EUR; si hay varias, la más cercana en
 * hora. Si ninguna es del mismo día, la más cercana en el tiempo (antes o
 * después). `null` si no hay candidatas válidas.
 *
 * Espejo de `pickUsdRateForEur` del BE (`shared/utils/payment-conversion.ts`):
 * ambos deben dar la misma tasa para que el cuadre del FE coincida con el
 * `amountInUsd` que persiste el BE. Como el BE sólo considera tasas USD
 * activas, aquí se descartan las `isActive === false`.
 */
export function matchUsdRateForEur(
  eurRate: Pick<ExchangeRate, 'effectiveDate'> | null | undefined,
  candidates: ReadonlyArray<ExchangeRate | null | undefined>,
): UsdRateForEurMatch | null {
  if (!eurRate?.effectiveDate) return null;
  const target = new Date(eurRate.effectiveDate);
  if (Number.isNaN(target.getTime())) return null;
  const dayKey = businessDayKey(target);
  const scored = candidates
    .filter(
      (r): r is ExchangeRate =>
        !!r && r.currency === 'USD' && r.isActive !== false,
    )
    .map((r) => {
      const t = new Date(r.effectiveDate).getTime();
      return {
        rate: r,
        delta: Number.isNaN(t) ? Infinity : Math.abs(t - target.getTime()),
        sameDay: !Number.isNaN(t) && businessDayKey(new Date(t)) === dayKey,
      };
    })
    .filter((s) => s.delta !== Infinity);
  if (scored.length === 0) return null;
  const sameDay = scored.filter((s) => s.sameDay);
  const pool = sameDay.length ? sameDay : scored;
  pool.sort((a, b) => a.delta - b.delta);
  return { rate: pool[0].rate, sameDay: pool[0].sameDay };
}

/** Atajo: sólo la tasa, o `null`. */
export function pickUsdRateForEur(
  eurRate: Pick<ExchangeRate, 'effectiveDate'> | null | undefined,
  candidates: ReadonlyArray<ExchangeRate | null | undefined>,
): ExchangeRate | null {
  return matchUsdRateForEur(eurRate, candidates)?.rate ?? null;
}
