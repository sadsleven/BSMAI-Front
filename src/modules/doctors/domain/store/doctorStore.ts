import { create } from 'zustand';
import type {
  Doctor,
  DoctorsQuery,
  PaginatedResponse,
} from '../models/doctor';
import { doctorGateway } from '../../infrastructure/doctorGateway';

interface DoctorState {
  doctors: Doctor[];
  metadata: PaginatedResponse<Doctor>['metadata'];
  query: DoctorsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<DoctorsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const useDoctorStore = create<DoctorState>((set, get) => ({
  doctors: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await doctorGateway.list(get().query);
      set({ doctors: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ doctors: get().doctors.filter((d) => d.id !== id) }),
}));
