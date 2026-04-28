import { create } from 'zustand';
import type {
  Branch,
  BranchesQuery,
  PaginatedResponse,
} from '../models/branch';
import { branchGateway } from '../../infrastructure/branchGateway';

interface BranchState {
  branches: Branch[];
  metadata: PaginatedResponse<Branch>['metadata'];
  query: BranchesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<BranchesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await branchGateway.list(get().query);
      set({ branches: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ branches: get().branches.filter((b) => b.id !== id) }),
}));
