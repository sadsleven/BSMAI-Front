import { useEffect, useRef, useState } from 'react';
import type { Currency, ExchangeRate } from '../../domain/models/exchangeRate';
import {
  cachedActiveRates,
  loadActiveRates,
  subscribeRateCreated,
} from '../../infrastructure/exchangeRateGateway';

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

/** Inserta la tasa manteniendo el orden por fecha efectiva DESC (sin duplicar). */
function withRate(list: ExchangeRate[], rate: ExchangeRate): ExchangeRate[] {
  if (list.some((r) => r.id === rate.id)) return list;
  return [...list, rate].sort((a, b) =>
    a.effectiveDate < b.effectiveDate ? 1 : a.effectiveDate > b.effectiveDate ? -1 : 0,
  );
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
  // Arranca del caché compartido: al navegar entre vistas no hay request ni
  // parpadeo de "cargando" con la lista vacía.
  const seed = enabled ? cachedActiveRates(currency) : null;
  const [rates, setRates] = useState<ExchangeRate[]>(seed?.rates ?? []);
  const [currentRateId, setCurrentRateId] = useState<string | null>(
    seed?.current?.id ?? null,
  );
  const [loading, setLoading] = useState(enabled && !seed);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadActiveRates(currency)
      .then((value) => {
        if (cancelled) return;
        setRates(value.rates);
        setCurrentRateId(value.current?.id ?? value.rates[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setRates([]);
        setCurrentRateId(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency, enabled]);

  // Espejo del estado para leerlo dentro de la suscripción sin re-suscribir
  // en cada cambio de lista.
  const stateRef = useRef({ rates, currentRateId });
  useEffect(() => {
    stateRef.current = { rates, currentRateId };
  }, [rates, currentRateId]);

  // Alta rápida de tasa (botón "+" del selector): la nueva tasa entra a la
  // lista en caliente, sin recargar la pantalla. La vigente se mueve sólo si la
  // nueva es igual o más reciente (el BE resuelve `current` por fecha efectiva).
  useEffect(() => {
    if (!enabled) return;
    return subscribeRateCreated((rate) => {
      if (rate.currency !== currency || rate.isActive === false) return;
      const prevCurrent = stateRef.current.rates.find(
        (r) => r.id === stateRef.current.currentRateId,
      );
      if (!prevCurrent || rate.effectiveDate >= prevCurrent.effectiveDate) {
        setCurrentRateId(rate.id);
      }
      setRates((prev) => withRate(prev, rate));
    });
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
