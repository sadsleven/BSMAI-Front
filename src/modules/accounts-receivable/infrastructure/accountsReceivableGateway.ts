import { api } from '@/lib/api';
import type {
  AccountsReceivableBatch,
  AccountsReceivablePaymentInput,
  AccountsReceivableQuery,
  CreateAccountsReceivableBatchDto,
  PaginatedResponse,
  PendingReceivable,
  PendingReceivableQuery,
} from '../domain/models/accountsReceivable';

const BASE = '/accounts-receivable';

function pendingParams(
  q: PendingReceivableQuery,
): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    debtorType: q.debtorType,
    insuranceId: q.insuranceId,
    holderId: q.holderId,
    branchId: q.branchId,
  };
}

function batchParams(
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
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

export const accountsReceivableGateway = {
  async listPending(
    query: PendingReceivableQuery = {},
  ): Promise<PaginatedResponse<PendingReceivable>> {
    const { data } = await api.get<PaginatedResponse<PendingReceivable>>(
      `${BASE}/pending`,
      { params: pendingParams(query) },
    );
    return data;
  },
  async list(
    query: AccountsReceivableQuery = {},
  ): Promise<PaginatedResponse<AccountsReceivableBatch>> {
    const { data } = await api.get<PaginatedResponse<AccountsReceivableBatch>>(
      BASE,
      { params: batchParams(query) },
    );
    return data;
  },
  async getBatch(id: string): Promise<AccountsReceivableBatch> {
    const { data } = await api.get<AccountsReceivableBatch>(`${BASE}/${id}`);
    return data;
  },
  async createBatch(
    dto: CreateAccountsReceivableBatchDto,
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.post<AccountsReceivableBatch>(BASE, dto);
    return data;
  },
  async addOrders(
    id: string,
    orderIds: string[],
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.patch<AccountsReceivableBatch>(
      `${BASE}/${id}/orders/add`,
      { orderIds },
    );
    return data;
  },
  async removeOrders(
    id: string,
    orderIds: string[],
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.patch<AccountsReceivableBatch>(
      `${BASE}/${id}/orders/remove`,
      { orderIds },
    );
    return data;
  },
  /**
   * Ajuste (resta o suma) del total a cobrar del lote — p. ej. el seguro paga
   * menos de lo facturado. `amount` va en la moneda del lote (Bs en modo tasa
   * fija, USD en modo USD); 0 limpia el ajuste. Con ajuste ≠ 0 el motivo es
   * obligatorio.
   */
  async setAdjustment(
    id: string,
    amount: number,
    note?: string,
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.patch<AccountsReceivableBatch>(
      `${BASE}/${id}/adjustment`,
      { amount, note },
    );
    return data;
  },
  async registerCollection(
    id: string,
    payments: AccountsReceivablePaymentInput[],
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.post<AccountsReceivableBatch>(
      `${BASE}/${id}/payments`,
      { payments },
    );
    return data;
  },
  async editPayment(
    id: string,
    paymentId: string,
    dto: AccountsReceivablePaymentInput,
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.patch<AccountsReceivableBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
      dto,
    );
    return data;
  },
  async deletePayment(
    id: string,
    paymentId: string,
  ): Promise<AccountsReceivableBatch> {
    const { data } = await api.delete<AccountsReceivableBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
    );
    return data;
  },
  async deleteBatch(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
