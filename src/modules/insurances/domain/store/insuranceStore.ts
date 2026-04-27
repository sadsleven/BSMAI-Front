import { create } from 'zustand';
import type {
  Insurance,
  InsurancesQuery,
  PaginatedResponse,
} from '../models/insurance';
import { insuranceGateway } from '../../infrastructure/insuranceGateway';

interface InsuranceState {
  insurances: Insurance[];
  metadata: PaginatedResponse<Insurance>['metadata'];
  query: InsurancesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<InsurancesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useInsuranceStore = create<InsuranceState>((set, get) => ({
  insurances: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await insuranceGateway.list(get().query);
      set({ insurances: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) =>
    set({ insurances: get().insurances.filter((i) => i.id !== id) }),
}));
