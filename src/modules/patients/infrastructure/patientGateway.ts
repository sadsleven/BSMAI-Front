import { api } from '@/lib/api';
import type {
  CreatePatientDto,
  PaginatedResponse,
  Patient,
  PatientsQuery,
  UpdatePatientDto,
} from '../domain/models/patient';

function buildParams(q: PatientsQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
    birthDateFrom: q.birthDateFrom,
    birthDateTo: q.birthDateTo,
    insuranceId: q.insuranceId,
  };
}

export const patientGateway = {
  async list(query: PatientsQuery): Promise<PaginatedResponse<Patient>> {
    const { data } = await api.get<PaginatedResponse<Patient>>('/patients', {
      params: buildParams(query),
    });
    return data;
  },
  async getById(id: string): Promise<Patient> {
    const { data } = await api.get<Patient>(`/patients/${id}`);
    return data;
  },
  async create(dto: CreatePatientDto): Promise<Patient> {
    const { data } = await api.post<Patient>('/patients', dto);
    return data;
  },
  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const { data } = await api.patch<Patient>(`/patients/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Patient> {
    const { data } = await api.patch<Patient>(`/patients/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/patients/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/patients/${id}/permanent`);
  },
  async restore(id: string): Promise<Patient> {
    const { data } = await api.patch<Patient>(`/patients/${id}/restore`);
    return data;
  },
};
