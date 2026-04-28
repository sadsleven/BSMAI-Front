import { api } from '@/lib/api';
import type {
  ContractorsQuery,
  Contractor,
  CreateContractorDto,
  PaginatedResponse,
  UpdateContractorDto,
} from '../domain/models/contractor';

function buildParams(q: ContractorsQuery): Record<string, string | number | boolean | undefined> {
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

export const contractorGateway = {
  async list(query: ContractorsQuery): Promise<PaginatedResponse<Contractor>> {
    const { data } = await api.get<PaginatedResponse<Contractor>>('/contractors', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<Contractor[]> {
    const { data } = await api.get<Contractor[]>('/contractors/assignable');
    return data;
  },
  async getById(id: string): Promise<Contractor> {
    const { data } = await api.get<Contractor>(`/contractors/${id}`);
    return data;
  },
  async create(dto: CreateContractorDto): Promise<Contractor> {
    const { data } = await api.post<Contractor>('/contractors', dto);
    return data;
  },
  async update(id: string, dto: UpdateContractorDto): Promise<Contractor> {
    const { data } = await api.patch<Contractor>(`/contractors/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Contractor> {
    const { data } = await api.patch<Contractor>(`/contractors/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/contractors/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/contractors/${id}/permanent`);
  },
  async restore(id: string): Promise<Contractor> {
    const { data } = await api.patch<Contractor>(`/contractors/${id}/restore`);
    return data;
  },
};
