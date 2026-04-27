import { create } from 'zustand';
import type {
  PaginatedResponse,
  Patient,
  PatientsQuery,
} from '../models/patient';
import { patientGateway } from '../../infrastructure/patientGateway';

interface PatientState {
  patients: Patient[];
  metadata: PaginatedResponse<Patient>['metadata'];
  query: PatientsQuery;
  isLoading: boolean;
  error: string | null;
  setQuery: (q: Partial<PatientsQuery>) => void;
  fetch: () => Promise<void>;
  remove: (id: string) => void;
}

export const usePatientStore = create<PatientState>((set, get) => ({
  patients: [],
  metadata: { total: 0, page: 1, lastPage: 1 },
  query: { page: 1, limit: 10, sortBy: 'createdAt', sortDir: 'DESC' },
  isLoading: false,
  error: null,
  setQuery: (q) => set({ query: { ...get().query, ...q } }),
  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await patientGateway.list(get().query);
      set({ patients: res.data, metadata: res.metadata });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error' });
    } finally {
      set({ isLoading: false });
    }
  },
  remove: (id) => set({ patients: get().patients.filter((p) => p.id !== id) }),
}));
