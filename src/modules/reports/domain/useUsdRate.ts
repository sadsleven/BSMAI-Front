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
