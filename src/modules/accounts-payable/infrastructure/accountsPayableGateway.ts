import { api } from '@/lib/api';
import type {
  AccountsPayableBatch,
  AccountsPayablePaymentInput,
  AccountsPayableQuery,
  CreateAccountsPayableBatchDto,
  PaginatedResponse,
  PendingPayable,
  PendingPayableQuery,
} from '../domain/models/accountsPayable';

const BASE = '/accounts-payable';

function pendingParams(
  q: PendingPayableQuery,
): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    doctorId: q.doctorId,
    careCenterId: q.careCenterId,
    branchId: q.branchId,
  };
}

function batchParams(
  q: AccountsPayableQuery,
): Record<string, string | number | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    status: q.status,
    doctorId: q.doctorId,
    careCenterId: q.careCenterId,
    branchId: q.branchId,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  };
}

export const accountsPayableGateway = {
  async listPending(
    query: PendingPayableQuery = {},
  ): Promise<PaginatedResponse<PendingPayable>> {
    const { data } = await api.get<PaginatedResponse<PendingPayable>>(
      `${BASE}/pending`,
      { params: pendingParams(query) },
    );
    return data;
  },
  async list(
    query: AccountsPayableQuery = {},
  ): Promise<PaginatedResponse<AccountsPayableBatch>> {
    const { data } = await api.get<PaginatedResponse<AccountsPayableBatch>>(BASE, {
      params: batchParams(query),
    });
    return data;
  },
  async getBatch(id: string): Promise<AccountsPayableBatch> {
    const { data } = await api.get<AccountsPayableBatch>(`${BASE}/${id}`);
    return data;
  },
  async createBatch(
    dto: CreateAccountsPayableBatchDto,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.post<AccountsPayableBatch>(BASE, dto);
    return data;
  },
  async addOrders(
    id: string,
    internalOrderIds: string[],
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/orders/add`,
      { internalOrderIds },
    );
    return data;
  },
  async removeOrders(
    id: string,
    internalOrderIds: string[],
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/orders/remove`,
      { internalOrderIds },
    );
    return data;
  },
  /** Cambia la UT del cálculo de retención del lote (recalcula neto/estado). */
  async setTaxUnit(id: string, taxUnitId: string): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/tax-unit`,
      { taxUnitId },
    );
    return data;
  },
  /** Cambia la tasa de pago USD/Bs del lote (recalcula bruto Bs/retención/neto/estado). */
  async setExchangeRate(
    id: string,
    exchangeRateId: string,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/exchange-rate`,
      { exchangeRateId },
    );
    return data;
  },
  /** Activa/desactiva la retención de ISLR del lote (recalcula neto/estado). */
  async setRetention(
    id: string,
    applyRetention: boolean,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/retention`,
      { applyRetention },
    );
    return data;
  },
  /**
   * Fija (número) o quita (`null` ⇒ automático) el monto manual de la retención
   * del lote (recalcula neto/estado).
   */
  async setCustomRetention(
    id: string,
    customRetentionBs: number | null,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/custom-retention`,
      { customRetentionBs },
    );
    return data;
  },
  async registerPayment(
    id: string,
    payments: AccountsPayablePaymentInput[],
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.post<AccountsPayableBatch>(
      `${BASE}/${id}/payments`,
      { payments },
    );
    return data;
  },
  async editPayment(
    id: string,
    paymentId: string,
    dto: AccountsPayablePaymentInput,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
      dto,
    );
    return data;
  },
  async deletePayment(
    id: string,
    paymentId: string,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.delete<AccountsPayableBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
    );
    return data;
  },
  async deleteBatch(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
