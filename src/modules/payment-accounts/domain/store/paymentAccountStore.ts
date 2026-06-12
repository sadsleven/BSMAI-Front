import { create } from 'zustand';
import type {
  PaginatedResponse,
  PaymentAccount,
  PaymentAccountsQuery,
} from '../models/paymentAccount';
import { paymentAccountGateway } from '../../infrastructure/paymentAccountGateway';

interface PaymentAccountState {
  accounts: PaymentAccount[];
  metadata: PaginatedResponse<PaymentAccount>['metadata'];
  query: PaymentAccountsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<PaymentAccountsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const usePaymentAccountStore = create<PaymentAccountState>((set, get) => ({
  accounts: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await paymentAccountGateway.list(get().query);
      set({ accounts: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ accounts: get().accounts.filter((b) => b.id !== id) }),
}));
