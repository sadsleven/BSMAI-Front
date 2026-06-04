import { api } from '@/lib/api';
import type {
  AccountsReceivable,
  AccountsReceivableQuery,
  PaginatedResponse,
  RegisterCollectionDto,
} from '../domain/models/accountsReceivable';

function buildParams(
  q: AccountsReceivableQuery,
): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    status: q.status,
    insuranceId: q.insuranceId,
    holderId: q.holderId,
    debtorType: q.debtorType,
    branchId: q.branchId,
    orderId: q.orderId,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

export const accountsReceivableGateway = {
  async list(
    query: AccountsReceivableQuery = {},
  ): Promise<PaginatedResponse<AccountsReceivable>> {
    const { data } = await api.get<PaginatedResponse<AccountsReceivable>>(
      '/accounts-receivable',
      { params: buildParams(query) },
    );
    return data;
  },
  async getById(id: string): Promise<AccountsReceivable> {
    const { data } = await api.get<AccountsReceivable>(
      `/accounts-receivable/${id}`,
    );
    return data;
  },
  async registerCollection(
    dto: RegisterCollectionDto,
  ): Promise<AccountsReceivable[]> {
    const { data } = await api.post<AccountsReceivable[]>(
      '/accounts-receivable/register-collection',
      dto,
    );
    return data;
  },
};
