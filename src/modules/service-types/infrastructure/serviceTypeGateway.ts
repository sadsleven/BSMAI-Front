import { api } from '@/lib/api';
import type {
  CreateServiceTypeDto,
  PaginatedResponse,
  ServiceTypesQuery,
  ServiceType,
  UpdateServiceTypeDto,
} from '../domain/models/serviceType';

function buildParams(q: ServiceTypesQuery): Record<string, string | number | boolean | undefined> {
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

export const serviceTypeGateway = {
  async list(query: ServiceTypesQuery): Promise<PaginatedResponse<ServiceType>> {
    const { data } = await api.get<PaginatedResponse<ServiceType>>('/service-types', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<ServiceType[]> {
    const { data } = await api.get<ServiceType[]>('/service-types/assignable');
    return data;
  },
  async getById(id: string): Promise<ServiceType> {
    const { data } = await api.get<ServiceType>(`/service-types/${id}`);
    return data;
  },
  async create(dto: CreateServiceTypeDto): Promise<ServiceType> {
    const { data } = await api.post<ServiceType>('/service-types', dto);
    return data;
  },
  async update(id: string, dto: UpdateServiceTypeDto): Promise<ServiceType> {
    const { data } = await api.patch<ServiceType>(`/service-types/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<ServiceType> {
    const { data } = await api.patch<ServiceType>(`/service-types/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/service-types/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/service-types/${id}/permanent`);
  },
  async restore(id: string): Promise<ServiceType> {
    const { data } = await api.patch<ServiceType>(`/service-types/${id}/restore`);
    return data;
  },
};
