import { create } from 'zustand';
import type { PaginatedResponse, Role, RolesQuery } from '../models/role';
import { roleGateway } from '../../infrastructure/roleGateway';

interface RoleState {
  roles: Role[];
  metadata: PaginatedResponse<Role>['metadata'];
  query: RolesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<RolesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await roleGateway.list(get().query);
      set({ roles: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ roles: get().roles.filter((r) => r.id !== id) }),
}));
