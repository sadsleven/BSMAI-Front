import { create } from 'zustand';
import type { PaginatedResponse, SpecialtiesQuery, Specialty } from '../models/specialty';
import { specialtyGateway } from '../../infrastructure/specialtyGateway';

interface SpecialtyState {
  specialties: Specialty[];
  metadata: PaginatedResponse<Specialty>['metadata'];
  query: SpecialtiesQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<SpecialtiesQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useSpecialtyStore = create<SpecialtyState>((set, get) => ({
  specialties: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await specialtyGateway.list(get().query);
      set({ specialties: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) =>
    set({ specialties: get().specialties.filter((s) => s.id !== id) }),
}));
