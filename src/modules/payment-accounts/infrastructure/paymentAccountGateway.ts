import { api } from '@/lib/api';
import type {
  CreatePaymentAccountDto,
  PaginatedResponse,
  PaymentAccount,
  PaymentAccountType,
  PaymentAccountsQuery,
  UpdatePaymentAccountDto,
} from '../domain/models/paymentAccount';

function buildParams(
  q: PaymentAccountsQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    type: q.type,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
  };
}

export const paymentAccountGateway = {
  async list(query: PaymentAccountsQuery): Promise<PaginatedResponse<PaymentAccount>> {
    const { data } = await api.get<PaginatedResponse<PaymentAccount>>('/payment-accounts', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(params?: { type?: PaymentAccountType }): Promise<PaymentAccount[]> {
    const { data } = await api.get<PaymentAccount[]>('/payment-accounts/assignable', {
      params: params?.type ? { type: params.type } : undefined,
    });
    return data;
  },
  async getById(id: string): Promise<PaymentAccount> {
    const { data } = await api.get<PaymentAccount>(`/payment-accounts/${id}`);
    return data;
  },
  async create(dto: CreatePaymentAccountDto): Promise<PaymentAccount> {
    const { data } = await api.post<PaymentAccount>('/payment-accounts', dto);
    return data;
  },
  async update(id: string, dto: UpdatePaymentAccountDto): Promise<PaymentAccount> {
    const { data } = await api.patch<PaymentAccount>(`/payment-accounts/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<PaymentAccount> {
    const { data } = await api.patch<PaymentAccount>(`/payment-accounts/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/payment-accounts/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/payment-accounts/${id}/permanent`);
  },
  async restore(id: string): Promise<PaymentAccount> {
    const { data } = await api.patch<PaymentAccount>(`/payment-accounts/${id}/restore`);
    return data;
  },
};
