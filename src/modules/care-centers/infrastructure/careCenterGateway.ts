import { api } from '@/lib/api';
import type {
  CareCenter,
  CareCentersQuery,
  CreateCareCenterDto,
  PaginatedResponse,
  UpdateCareCenterDto,
} from '../domain/models/careCenter';

function buildParams(q: CareCentersQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
    specialtyId: q.specialtyId,
  };
}

export const careCenterGateway = {
  async list(query: CareCentersQuery): Promise<PaginatedResponse<CareCenter>> {
    const { data } = await api.get<PaginatedResponse<CareCenter>>('/care-centers', {
      params: buildParams(query),
    });
    return data;
  },
  async getById(id: string): Promise<CareCenter> {
    const { data } = await api.get<CareCenter>(`/care-centers/${id}`);
    return data;
  },
  async create(dto: CreateCareCenterDto): Promise<CareCenter> {
    const { data } = await api.post<CareCenter>('/care-centers', dto);
    return data;
  },
  async update(id: string, dto: UpdateCareCenterDto): Promise<CareCenter> {
    const { data } = await api.patch<CareCenter>(`/care-centers/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<CareCenter> {
    const { data } = await api.patch<CareCenter>(`/care-centers/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/care-centers/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/care-centers/${id}/permanent`);
  },
  async restore(id: string): Promise<CareCenter> {
    const { data } = await api.patch<CareCenter>(`/care-centers/${id}/restore`);
    return data;
  },
};
