import { api } from '@/lib/api';
import type {
  CreateExchangeRateDto,
  Currency,
  ExchangeRate,
  ExchangeRatesQuery,
  PaginatedResponse,
  UpdateExchangeRateDto,
} from '../domain/models/exchangeRate';

function buildParams(q: ExchangeRatesQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    currency: q.currency,
    effectiveDateFrom: q.effectiveDateFrom,
    effectiveDateTo: q.effectiveDateTo,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
  };
}

/**
 * Caché de las tasas activas por moneda, compartida por toda la app.
 *
 * Cada pantalla que deja elegir tasa (órdenes, cuentas por cobrar/pagar,
 * retenciones) pedía `list` + `current` al montarse: 2 requests por montaje y
 * por moneda, repetidos al navegar entre vistas. Acá se piden una vez, se
 * reusan durante `RATES_TTL_MS` y las peticiones simultáneas comparten la misma
 * promesa. Las mutaciones del CRUD de tasas invalidan la caché al instante.
 */
const RATES_TTL_MS = 60_000;

export interface ActiveRates {
  /** Tasas activas de la moneda, por fecha efectiva DESC. */
  rates: ExchangeRate[];
  /** Tasa vigente (o la más reciente disponible). */
  current: ExchangeRate | null;
}

const ratesCache = new Map<Currency, { at: number; value: ActiveRates }>();
const ratesInFlight = new Map<Currency, Promise<ActiveRates>>();

/**
 * Suscriptores a tasas recién creadas. El alta rápida (botón "+" junto al
 * selector de tasa en órdenes, cuentas por cobrar y por pagar) crea la tasa en
 * caliente: avisar acá hace que todos los selectores montados la agreguen a su
 * lista sin recargar la pantalla ni esperar a que expire la caché.
 */
type RateCreatedListener = (rate: ExchangeRate) => void;
const rateCreatedListeners = new Set<RateCreatedListener>();

/** Escucha las tasas creadas en cualquier parte de la app. Devuelve el unsubscribe. */
export function subscribeRateCreated(fn: RateCreatedListener): () => void {
  rateCreatedListeners.add(fn);
  return () => {
    rateCreatedListeners.delete(fn);
  };
}

/** Descarta la caché de tasas (tras crear/editar/borrar una tasa). */
export function invalidateRatesCache(): void {
  ratesCache.clear();
  ratesInFlight.clear();
}

/** Valor cacheado si sigue fresco; `null` si hay que pedirlo. */
export function cachedActiveRates(currency: Currency): ActiveRates | null {
  const hit = ratesCache.get(currency);
  return hit && Date.now() - hit.at < RATES_TTL_MS ? hit.value : null;
}

/** Tasas activas + vigente de una moneda, desde caché o del servidor. */
export function loadActiveRates(currency: Currency): Promise<ActiveRates> {
  const hit = cachedActiveRates(currency);
  if (hit) return Promise.resolve(hit);
  const pending = ratesInFlight.get(currency);
  if (pending) return pending;
  const request = (async () => {
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
    let rates = res.data;
    if (current && !rates.some((r) => r.id === current.id)) {
      rates = [current, ...rates];
    }
    const value: ActiveRates = { rates, current: current ?? rates[0] ?? null };
    ratesCache.set(currency, { at: Date.now(), value });
    return value;
  })().finally(() => ratesInFlight.delete(currency));
  ratesInFlight.set(currency, request);
  return request;
}

export const exchangeRateGateway = {
  async list(query: ExchangeRatesQuery): Promise<PaginatedResponse<ExchangeRate>> {
    const { data } = await api.get<PaginatedResponse<ExchangeRate>>('/exchange-rates', {
      params: buildParams(query),
    });
    return data;
  },
  async getCurrent(currency: Currency): Promise<ExchangeRate> {
    const { data } = await api.get<ExchangeRate>('/exchange-rates/current', {
      params: { currency },
    });
    return data;
  },
  async getCurrentSummary(): Promise<Record<Currency, ExchangeRate | null>> {
    const { data } = await api.get<Record<Currency, ExchangeRate | null>>(
      '/exchange-rates/current-summary',
    );
    return data;
  },
  async getById(id: string): Promise<ExchangeRate> {
    const { data } = await api.get<ExchangeRate>(`/exchange-rates/${id}`);
    return data;
  },
  async create(dto: CreateExchangeRateDto): Promise<ExchangeRate> {
    const { data } = await api.post<ExchangeRate>('/exchange-rates', dto);
    invalidateRatesCache();
    for (const fn of rateCreatedListeners) fn(data);
    return data;
  },
  async update(id: string, dto: UpdateExchangeRateDto): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}`, dto);
    invalidateRatesCache();
    return data;
  },
  async toggleActive(id: string): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}/toggle-active`);
    invalidateRatesCache();
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/exchange-rates/${id}`);
    invalidateRatesCache();
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/exchange-rates/${id}/permanent`);
    invalidateRatesCache();
  },
  async restore(id: string): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}/restore`);
    invalidateRatesCache();
    return data;
  },
};
