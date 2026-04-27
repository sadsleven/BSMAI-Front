import { api } from '@/lib/api';
import type {
  CreateInsuranceDto,
  Insurance,
  InsurancesQuery,
  PaginatedResponse,
  UpdateInsuranceDto,
} from '../domain/models/insurance';

function buildParams(q: InsurancesQuery): Record<string, string | number | boolean | undefined> {
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

export const insuranceGateway = {
  async list(query: InsurancesQuery): Promise<PaginatedResponse<Insurance>> {
    const { data } = await api.get<PaginatedResponse<Insurance>>('/insurances', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<Insurance[]> {
    const { data } = await api.get<Insurance[]>('/insurances/assignable');
    return data;
  },
  async getById(id: string): Promise<Insurance> {
    const { data } = await api.get<Insurance>(`/insurances/${id}`);
    return data;
  },
  async create(dto: CreateInsuranceDto): Promise<Insurance> {
    const { data } = await api.post<Insurance>('/insurances', dto);
    return data;
  },
  async update(id: string, dto: UpdateInsuranceDto): Promise<Insurance> {
    const { data } = await api.patch<Insurance>(`/insurances/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Insurance> {
    const { data } = await api.patch<Insurance>(`/insurances/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/insurances/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/insurances/${id}/permanent`);
  },
  async restore(id: string): Promise<Insurance> {
    const { data } = await api.patch<Insurance>(`/insurances/${id}/restore`);
    return data;
  },
};
