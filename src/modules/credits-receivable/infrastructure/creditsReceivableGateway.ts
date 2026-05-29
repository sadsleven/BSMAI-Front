import { api } from '@/lib/api';
import type {
  CreditsReceivable,
  CreditsReceivableQuery,
  PaginatedResponse,
  RegisterCreditCollectionDto,
} from '../domain/models/creditsReceivable';

function buildParams(
  q: CreditsReceivableQuery,
): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    status: q.status,
    holderId: q.holderId,
    branchId: q.branchId,
    orderId: q.orderId,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

export const creditsReceivableGateway = {
  async list(
    query: CreditsReceivableQuery = {},
  ): Promise<PaginatedResponse<CreditsReceivable>> {
    const { data } = await api.get<PaginatedResponse<CreditsReceivable>>(
      '/credits-receivable',
      { params: buildParams(query) },
    );
    return data;
  },
  async getById(id: string): Promise<CreditsReceivable> {
    const { data } = await api.get<CreditsReceivable>(
      `/credits-receivable/${id}`,
    );
    return data;
  },
  async registerCollection(
    dto: RegisterCreditCollectionDto,
  ): Promise<CreditsReceivable[]> {
    const { data } = await api.post<CreditsReceivable[]>(
      '/credits-receivable/register-collection',
      dto,
    );
    return data;
  },
};
