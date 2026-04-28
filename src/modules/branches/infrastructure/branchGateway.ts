import { api } from '@/lib/api';
import type {
  Branch,
  BranchesQuery,
  CreateBranchDto,
  PaginatedResponse,
  UpdateBranchDto,
} from '../domain/models/branch';

function buildParams(q: BranchesQuery): Record<string, string | number | boolean | undefined> {
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

export const branchGateway = {
  async list(query: BranchesQuery): Promise<PaginatedResponse<Branch>> {
    const { data } = await api.get<PaginatedResponse<Branch>>('/branches', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<Branch[]> {
    const { data } = await api.get<Branch[]>('/branches/assignable');
    return data;
  },
  async getById(id: string): Promise<Branch> {
    const { data } = await api.get<Branch>(`/branches/${id}`);
    return data;
  },
  async create(dto: CreateBranchDto): Promise<Branch> {
    const { data } = await api.post<Branch>('/branches', dto);
    return data;
  },
  async update(id: string, dto: UpdateBranchDto): Promise<Branch> {
    const { data } = await api.patch<Branch>(`/branches/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Branch> {
    const { data } = await api.patch<Branch>(`/branches/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/branches/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/branches/${id}/permanent`);
  },
  async restore(id: string): Promise<Branch> {
    const { data } = await api.patch<Branch>(`/branches/${id}/restore`);
    return data;
  },
};
