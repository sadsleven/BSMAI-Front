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
    return data;
  },
  async update(id: string, dto: UpdateExchangeRateDto): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/exchange-rates/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/exchange-rates/${id}/permanent`);
  },
  async restore(id: string): Promise<ExchangeRate> {
    const { data } = await api.patch<ExchangeRate>(`/exchange-rates/${id}/restore`);
    return data;
  },
};
