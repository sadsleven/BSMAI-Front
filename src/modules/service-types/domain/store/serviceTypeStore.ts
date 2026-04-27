import { create } from 'zustand';
import type {
  PaginatedResponse,
  ServiceTypesQuery,
  ServiceType,
} from '../models/serviceType';
import { serviceTypeGateway } from '../../infrastructure/serviceTypeGateway';

interface ServiceTypeState {
  serviceTypes: ServiceType[];
  metadata: PaginatedResponse<ServiceType>['metadata'];
  query: ServiceTypesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<ServiceTypesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useServiceTypeStore = create<ServiceTypeState>((set, get) => ({
  serviceTypes: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await serviceTypeGateway.list(get().query);
      set({ serviceTypes: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) =>
    set({ serviceTypes: get().serviceTypes.filter((p) => p.id !== id) }),
}));
