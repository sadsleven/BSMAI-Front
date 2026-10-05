import { api } from '@/lib/api';
import type {
  Budget,
  BudgetsQuery,
  ChangeBudgetStatusDto,
  CreateBudgetDto,
  PaginatedResponse,
  UpdateBudgetDto,
} from '../domain/models/budget';

function buildParams(q: BudgetsQuery): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (q.page) out.page = String(q.page);
  if (q.limit) out.limit = String(q.limit);
  if (q.search) out.search = q.search;
  if (q.status) out.status = q.status;
  if (q.type) out.type = q.type;
  if (q.branchId) out.branchId = q.branchId;
  if (q.insuranceId) out.insuranceId = q.insuranceId;
  if (q.patientId) out.patientId = q.patientId;
  if (q.budgetDateFrom) out.budgetDateFrom = q.budgetDateFrom;
  if (q.budgetDateTo) out.budgetDateTo = q.budgetDateTo;
  if (q.expired !== undefined) out.expired = String(q.expired);
  if (q.converted !== undefined) out.converted = String(q.converted);
  if (q.sortBy) out.sortBy = q.sortBy;
  if (q.sortDir) out.sortDir = q.sortDir;
  if (q.withDeleted) out.withDeleted = 'true';
  if (q.onlyDeleted) out.onlyDeleted = 'true';
  return out;
}

export const budgetGateway = {
  async list(query: BudgetsQuery = {}): Promise<PaginatedResponse<Budget>> {
    const { data } = await api.get<PaginatedResponse<Budget>>('/budgets', {
      params: buildParams(query),
    });
    return data;
  },
  async getById(id: string): Promise<Budget> {
    const { data } = await api.get<Budget>(`/budgets/${id}`);
    return data;
  },
  async create(dto: CreateBudgetDto): Promise<Budget> {
    const { data } = await api.post<Budget>('/budgets', dto);
    return data;
  },
  async update(id: string, dto: UpdateBudgetDto): Promise<Budget> {
    const { data } = await api.patch<Budget>(`/budgets/${id}`, dto);
    return data;
  },
  async changeStatus(
    id: string,
    dto: ChangeBudgetStatusDto,
  ): Promise<Budget> {
    const { data } = await api.patch<Budget>(`/budgets/${id}/status`, dto);
    return data;
  },
  /** Enlaza la orden recién creada desde el presupuesto (lo deja aprobado). */
  async linkOrder(id: string, orderId: string): Promise<Budget> {
    const { data } = await api.patch<Budget>(`/budgets/${id}/link-order`, {
      orderId,
    });
    return data;
  },
  async restore(id: string): Promise<Budget> {
    const { data } = await api.patch<Budget>(`/budgets/${id}/restore`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/budgets/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/budgets/${id}/permanent`);
  },
};
