import { create } from 'zustand';
import type {
  PaginatedResponse,
  PathologiesQuery,
  Pathology,
} from '../models/pathology';
import { pathologyGateway } from '../../infrastructure/pathologyGateway';

interface PathologyState {
  pathologies: Pathology[];
  metadata: PaginatedResponse<Pathology>['metadata'];
  query: PathologiesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<PathologiesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const usePathologyStore = create<PathologyState>((set, get) => ({
  pathologies: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await pathologyGateway.list(get().query);
      set({ pathologies: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ pathologies: get().pathologies.filter((p) => p.id !== id) }),
}));
