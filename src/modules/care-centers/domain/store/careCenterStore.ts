import { create } from 'zustand';
import type {
  CareCenter,
  CareCentersQuery,
  PaginatedResponse,
} from '../models/careCenter';
import { careCenterGateway } from '../../infrastructure/careCenterGateway';

interface CareCenterState {
  centers: CareCenter[];
  metadata: PaginatedResponse<CareCenter>['metadata'];
  query: CareCentersQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<CareCentersQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useCareCenterStore = create<CareCenterState>((set, get) => ({
  centers: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await careCenterGateway.list(get().query);
      set({ centers: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ centers: get().centers.filter((c) => c.id !== id) }),
}));
