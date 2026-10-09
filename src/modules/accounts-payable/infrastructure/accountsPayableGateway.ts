import { api } from '@/lib/api';
import type {
  AccountsPayableBatch,
  AccountsPayableQuery,
  AccountsPayableSettlementInput,
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
  /** Cambia la tasa de pago USD/Bs por defecto del lote (no toca los abonos ya hechos). */
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
  /** Registra un abono: USD cubiertos + tasa + retención + sus filas de pago. */
  async registerSettlement(
    id: string,
    dto: AccountsPayableSettlementInput,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.post<AccountsPayableBatch>(
      `${BASE}/${id}/settlements`,
      dto,
    );
    return data;
  },
  /** Reemplaza por completo un abono (incluidas sus filas de pago). */
  async editSettlement(
    id: string,
    settlementId: string,
    dto: AccountsPayableSettlementInput,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.patch<AccountsPayableBatch>(
      `${BASE}/${id}/settlements/${settlementId}`,
      dto,
    );
    return data;
  },
  async deleteSettlement(
    id: string,
    settlementId: string,
  ): Promise<AccountsPayableBatch> {
    const { data } = await api.delete<AccountsPayableBatch>(
      `${BASE}/${id}/settlements/${settlementId}`,
    );
    return data;
  },
  async deleteBatch(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
