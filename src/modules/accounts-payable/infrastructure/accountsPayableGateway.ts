import { api } from '@/lib/api';
import type {
  AccountsPayable,
  AccountsPayableQuery,
  PaginatedResponse,
  RegisterPaymentDto,
} from '../domain/models/accountsPayable';

function buildParams(q: AccountsPayableQuery): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    status: q.status,
    doctorId: q.doctorId,
    careCenterId: q.careCenterId,
    branchId: q.branchId,
    orderId: q.orderId,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

export const accountsPayableGateway = {
  async list(
    query: AccountsPayableQuery = {},
  ): Promise<PaginatedResponse<AccountsPayable>> {
    const { data } = await api.get<PaginatedResponse<AccountsPayable>>(
      '/accounts-payable',
      { params: buildParams(query) },
    );
    return data;
  },
  async getById(id: string): Promise<AccountsPayable> {
    const { data } = await api.get<AccountsPayable>(`/accounts-payable/${id}`);
    return data;
  },
  async registerPayment(dto: RegisterPaymentDto): Promise<AccountsPayable[]> {
    const { data } = await api.post<AccountsPayable[]>(
      '/accounts-payable/register-payment',
      dto,
    );
    return data;
  },
};
