import { useEffect, useState } from 'react';
import type { Currency, ExchangeRate } from '../../domain/models/exchangeRate';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';

export interface UseRatesResult {
  /** Tasas activas de la moneda, ordenadas por fecha efectiva DESC. */
  rates: ExchangeRate[];
  /** Id de la tasa vigente / más actual disponible (auto-selección por defecto). */
  currentRateId: string | null;
  loading: boolean;
}

const EMPTY_RESULT: UseRatesResult = {
  rates: [],
  currentRateId: null,
  loading: false,
};

export interface UseUsdRatesResult {
  /** Tasas USD activas, ordenadas por fecha efectiva DESC (más reciente primero). */
  usdRates: ExchangeRate[];
  /** Id de la tasa vigente / más actual disponible (auto-selección por defecto). */
  currentRateId: string | null;
  loading: boolean;
}

/**
 * Carga las tasas activas de una moneda para selección manual y resuelve la
 * vigente. Reutilizado por los flujos de cobro/pago (paso 1 de la orden,
 * cuentas por cobrar/pagar, retenciones) que permiten elegir con qué tasa se
 * está pagando. Con `enabled=false` no consulta nada.
 */
export function useRatesByCurrency(
  currency: Currency,
  enabled = true,
): UseRatesResult {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currentRateId, setCurrentRateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [res, current] = await Promise.all([
          exchangeRateGateway.list({
            currency,
            isActive: true,
            sortBy: 'effectiveDate',
            sortDir: 'DESC',
            limit: 100,
          }),
          exchangeRateGateway.getCurrent(currency).catch(() => null),
        ]);
        if (cancelled) return;
        let list = res.data;
        if (current && !list.some((r) => r.id === current.id)) {
          list = [current, ...list];
        }
        setRates(list);
        setCurrentRateId(current?.id ?? list[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setRates([]);
          setCurrentRateId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency, enabled]);

  // Deshabilitado: resultado vacío sin tocar estado (evita renders en cascada).
  if (!enabled) return EMPTY_RESULT;
  return { rates, currentRateId, loading };
}

/** Azúcar sobre `useRatesByCurrency('USD')` (nombre histórico del hook). */
export function useUsdRates(): UseUsdRatesResult {
  const { rates, currentRateId, loading } = useRatesByCurrency('USD');
  return { usdRates: rates, currentRateId, loading };
}
