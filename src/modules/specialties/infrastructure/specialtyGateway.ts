import { api } from '@/lib/api';
import type {
  CreateSpecialtyDto,
  PaginatedResponse,
  SpecialtiesQuery,
  Specialty,
  UpdateSpecialtyDto,
} from '../domain/models/specialty';

function buildParams(q: SpecialtiesQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
  };
}

export const specialtyGateway = {
  async list(query: SpecialtiesQuery): Promise<PaginatedResponse<Specialty>> {
    const { data } = await api.get<PaginatedResponse<Specialty>>('/specialties', {
      params: buildParams(query),
    });
    return data;
  },

  async listAssignable(): Promise<Specialty[]> {
    const { data } = await api.get<Specialty[]>('/specialties/assignable');
    return data;
  },

  async getById(id: string): Promise<Specialty> {
    const { data } = await api.get<Specialty>(`/specialties/${id}`);
    return data;
  },

  async create(dto: CreateSpecialtyDto): Promise<Specialty> {
    const { data } = await api.post<Specialty>('/specialties', dto);
    return data;
  },

  async update(id: string, dto: UpdateSpecialtyDto): Promise<Specialty> {
    const { data } = await api.patch<Specialty>(`/specialties/${id}`, dto);
    return data;
  },

  async toggleActive(id: string): Promise<Specialty> {
    const { data } = await api.patch<Specialty>(`/specialties/${id}/toggle-active`);
    return data;
  },

  async softDelete(id: string): Promise<void> {
    await api.delete(`/specialties/${id}`);
  },

  async hardDelete(id: string): Promise<void> {
    await api.delete(`/specialties/${id}/permanent`);
  },

  async restore(id: string): Promise<Specialty> {
    const { data } = await api.patch<Specialty>(`/specialties/${id}/restore`);
    return data;
  },
};
