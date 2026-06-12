import { useEffect, useState } from 'react';
import type { ExchangeRate } from '../../domain/models/exchangeRate';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';

export interface UseUsdRatesResult {
  /** Tasas USD activas, ordenadas por fecha efectiva DESC (más reciente primero). */
  usdRates: ExchangeRate[];
  /** Id de la tasa vigente / más actual disponible (auto-selección por defecto). */
  currentRateId: string | null;
  loading: boolean;
}

/**
 * Carga las tasas USD activas para selección manual y resuelve la vigente.
 * Reutilizado por los flujos de cobro/pago (cuentas por cobrar/pagar,
 * retenciones) que permiten elegir con qué tasa convertir.
 */
export function useUsdRates(): UseUsdRatesResult {
  const [usdRates, setUsdRates] = useState<ExchangeRate[]>([]);
  const [currentRateId, setCurrentRateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, current] = await Promise.all([
          exchangeRateGateway.list({
            currency: 'USD',
            isActive: true,
            sortBy: 'effectiveDate',
            sortDir: 'DESC',
            limit: 100,
          }),
          exchangeRateGateway.getCurrent('USD').catch(() => null),
        ]);
        if (cancelled) return;
        let list = res.data;
        if (current && !list.some((r) => r.id === current.id)) {
          list = [current, ...list];
        }
        setUsdRates(list);
        setCurrentRateId(current?.id ?? list[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setUsdRates([]);
          setCurrentRateId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { usdRates, currentRateId, loading };
}
