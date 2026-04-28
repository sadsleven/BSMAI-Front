import { create } from 'zustand';
import { orderGateway } from '../../infrastructure/orderGateway';
import type { Order, OrdersQuery, PaginatedResponse } from '../models/order';

interface OrderState {
  orders: Order[];
  metadata: PaginatedResponse<Order>['metadata'];
  query: OrdersQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<OrdersQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await orderGateway.list(get().query);
      set({ orders: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ orders: get().orders.filter((o) => o.id !== id) }),
}));
