import { create } from 'zustand';
import type {
  Budget,
  BudgetsQuery,
  PaginatedResponse,
} from '../models/budget';
import { budgetGateway } from '../../infrastructure/budgetGateway';

interface BudgetState {
  budgets: Budget[];
  metadata: PaginatedResponse<Budget>['metadata'];
  query: BudgetsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<BudgetsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  budgets: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  // Por defecto, el más reciente primero: el correlativo es la referencia.
  query: { page: 1, limit: 10, sortBy: 'budgetNumber', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await budgetGateway.list(get().query);
      set({ budgets: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ budgets: get().budgets.filter((b) => b.id !== id) }),
}));
