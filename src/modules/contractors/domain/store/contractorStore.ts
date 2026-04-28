import { create } from 'zustand';
import type {
  ContractorsQuery,
  Contractor,
  PaginatedResponse,
} from '../models/contractor';
import { contractorGateway } from '../../infrastructure/contractorGateway';

interface ContractorState {
  contractors: Contractor[];
  metadata: PaginatedResponse<Contractor>['metadata'];
  query: ContractorsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<ContractorsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useContractorStore = create<ContractorState>((set, get) => ({
  contractors: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await contractorGateway.list(get().query);
      set({ contractors: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ contractors: get().contractors.filter((p) => p.id !== id) }),
}));
