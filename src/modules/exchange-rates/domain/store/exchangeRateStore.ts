import { create } from 'zustand';
import type {
  ExchangeRate,
  ExchangeRatesQuery,
  PaginatedResponse,
} from '../models/exchangeRate';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';

interface ExchangeRateState {
  rates: ExchangeRate[];
  metadata: PaginatedResponse<ExchangeRate>['metadata'];
  query: ExchangeRatesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<ExchangeRatesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useExchangeRateStore = create<ExchangeRateState>((set, get) => ({
  rates: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'effectiveDate', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await exchangeRateGateway.list(get().query);
      set({ rates: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ rates: get().rates.filter((r) => r.id !== id) }),
}));
