import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type TaxRates = {
  doctorNaturalTaxRate: number;
  doctorLegalTaxRate: number;
};

const FALLBACK: TaxRates = {
  doctorNaturalTaxRate: 0.03,
  doctorLegalTaxRate: 0.05,
};

let cached: TaxRates | null = null;
let inFlight: Promise<TaxRates> | null = null;

/** Carga (con caché) las tasas de impuesto desde `/config/tax-rates`. */
export async function fetchTaxRates(): Promise<TaxRates> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = api
    .get<TaxRates>('/config/tax-rates')
    .then((res) => {
      cached = res.data;
      return cached;
    })
    .catch(() => {
      cached = FALLBACK;
      return FALLBACK;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Hook React que carga + cachea las tasas. Devuelve `null` mientras carga. */
export function useTaxRates(): TaxRates | null {
  const [rates, setRates] = useState<TaxRates | null>(cached);
  useEffect(() => {
    if (cached) {
      setRates(cached);
      return;
    }
    let alive = true;
    fetchTaxRates().then((r) => {
      if (alive) setRates(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}

/** Devuelve la tasa que aplica a un doctor según `isLegalEntity`. */
export function taxRateFor(rates: TaxRates | null, isLegalEntity: boolean): number {
  const r = rates ?? FALLBACK;
  return isLegalEntity ? r.doctorLegalTaxRate : r.doctorNaturalTaxRate;
}
