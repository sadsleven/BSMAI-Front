import { api } from '@/lib/api';
import type {
  CreatePathologyDto,
  PaginatedResponse,
  PathologiesQuery,
  Pathology,
  UpdatePathologyDto,
} from '../domain/models/pathology';

function buildParams(q: PathologiesQuery): Record<string, string | number | boolean | undefined> {
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

export const pathologyGateway = {
  async list(query: PathologiesQuery): Promise<PaginatedResponse<Pathology>> {
    const { data } = await api.get<PaginatedResponse<Pathology>>('/pathologies', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<Pathology[]> {
    const { data } = await api.get<Pathology[]>('/pathologies/assignable');
    return data;
  },
  async getById(id: string): Promise<Pathology> {
    const { data } = await api.get<Pathology>(`/pathologies/${id}`);
    return data;
  },
  async create(dto: CreatePathologyDto): Promise<Pathology> {
    const { data } = await api.post<Pathology>('/pathologies', dto);
    return data;
  },
  async update(id: string, dto: UpdatePathologyDto): Promise<Pathology> {
    const { data } = await api.patch<Pathology>(`/pathologies/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Pathology> {
    const { data } = await api.patch<Pathology>(`/pathologies/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/pathologies/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/pathologies/${id}/permanent`);
  },
  async restore(id: string): Promise<Pathology> {
    const { data } = await api.patch<Pathology>(`/pathologies/${id}/restore`);
    return data;
  },
};
