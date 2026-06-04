import { api } from '@/lib/api';
import type {
  CreateTaxUnitDto,
  PaginatedResponse,
  TaxUnit,
  TaxUnitsQuery,
  UpdateTaxUnitDto,
} from '../domain/models/taxUnit';

function buildParams(q: TaxUnitsQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    effectiveDateFrom: q.effectiveDateFrom,
    effectiveDateTo: q.effectiveDateTo,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
  };
}

export const taxUnitGateway = {
  async list(query: TaxUnitsQuery): Promise<PaginatedResponse<TaxUnit>> {
    const { data } = await api.get<PaginatedResponse<TaxUnit>>('/tax-units', {
      params: buildParams(query),
    });
    return data;
  },
  async getCurrent(): Promise<TaxUnit | null> {
    const { data } = await api.get<TaxUnit | null>('/tax-units/current');
    return data;
  },
  async getById(id: string): Promise<TaxUnit> {
    const { data } = await api.get<TaxUnit>(`/tax-units/${id}`);
    return data;
  },
  async create(dto: CreateTaxUnitDto): Promise<TaxUnit> {
    const { data } = await api.post<TaxUnit>('/tax-units', dto);
    return data;
  },
  async update(id: string, dto: UpdateTaxUnitDto): Promise<TaxUnit> {
    const { data } = await api.patch<TaxUnit>(`/tax-units/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<TaxUnit> {
    const { data } = await api.patch<TaxUnit>(`/tax-units/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/tax-units/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/tax-units/${id}/permanent`);
  },
  async restore(id: string): Promise<TaxUnit> {
    const { data } = await api.patch<TaxUnit>(`/tax-units/${id}/restore`);
    return data;
  },
};
