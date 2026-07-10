import { useEffect, useState } from 'react';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';

/** Hook: carga tasa USD/Bs vigente. Retorna `amountBs` o null si no hay. */
export function useUsdRate(): number | null {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    exchangeRateGateway
      .getCurrent('USD')
      .then((r) => {
        if (cancelled) return;
        const n = Number(r.amountBs);
        setRate(Number.isFinite(n) && n > 0 ? n : null);
      })
      .catch(() => {
        if (!cancelled) setRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return rate;
}

/** USD → Bs vía tasa. Si rate null, retorna null (formatBs maneja '—'). */
export function usdToBs(usd: number | null | undefined, rate: number | null): number | null {
  if (usd === null || usd === undefined || rate === null) return null;
  const n = Number(usd);
  if (!Number.isFinite(n)) return null;
  return n * rate;
}

/** Bs → USD vía tasa. Si rate null o ≤ 0, retorna 0. */
export function bsToUsd(bs: number | string | null | undefined, rate: number | null): number {
  if (bs === null || bs === undefined) return 0;
  const n = Number(bs);
  if (!Number.isFinite(n)) return 0;
  if (!rate || rate <= 0) return 0;
  return n / rate;
}

/** Forma mínima de un pago SENIAT para convertirlo a USD. */
export type TaxPaymentLike = {
  amountInBs: string | number;
  amountCurrency?: string;
  amountValue?: string | number;
  exchangeRate?: { currency: string; amountBs: string | number } | null;
};

/**
 * USD de un pago SENIAT histórico: monto directo si la moneda es USD; si no,
 * Bs a la tasa USD del propio pago (snapshot). La tasa vigente (`currentRate`)
 * es sólo fallback — revalorar pagos viejos con la tasa de hoy distorsiona el
 * flujo de caja histórico.
 */
export function taxPaymentToUsd(p: TaxPaymentLike, currentRate: number | null): number {
  if (p.amountCurrency === 'USD') return Number(p.amountValue || 0);
  const ownUsdRate = p.exchangeRate?.currency === 'USD' ? Number(p.exchangeRate.amountBs) : 0;
  if (Number.isFinite(ownUsdRate) && ownUsdRate > 0) {
    return Number(p.amountInBs || 0) / ownUsdRate;
  }
  return bsToUsd(p.amountInBs, currentRate);
}
