import { create } from 'zustand';
import type {
  PaginatedResponse,
  TaxUnit,
  TaxUnitsQuery,
} from '../models/taxUnit';
import { taxUnitGateway } from '../../infrastructure/taxUnitGateway';

interface TaxUnitState {
  items: TaxUnit[];
  metadata: PaginatedResponse<TaxUnit>['metadata'];
  query: TaxUnitsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<TaxUnitsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useTaxUnitStore = create<TaxUnitState>((set, get) => ({
  items: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'effectiveDate', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await taxUnitGateway.list(get().query);
      set({ items: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ items: get().items.filter((r) => r.id !== id) }),
}));
