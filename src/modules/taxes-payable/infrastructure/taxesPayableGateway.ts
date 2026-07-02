import { api } from '@/lib/api';
import type {
  CreateTaxBatchDto,
  PaginatedResponse,
  PendingTaxQuery,
  TaxBatch,
  TaxesPayableQuery,
  TaxObligation,
  TaxPayablePaymentInput,
} from '../domain/models/taxesPayable';

const BASE = '/taxes-payable';

function pendingParams(
  q: PendingTaxQuery,
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
  q: TaxesPayableQuery,
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

export const taxesPayableGateway = {
  async listPending(
    query: PendingTaxQuery = {},
  ): Promise<PaginatedResponse<TaxObligation>> {
    const { data } = await api.get<PaginatedResponse<TaxObligation>>(
      `${BASE}/pending`,
      { params: pendingParams(query) },
    );
    return data;
  },
  async list(
    query: TaxesPayableQuery = {},
  ): Promise<PaginatedResponse<TaxBatch>> {
    const { data } = await api.get<PaginatedResponse<TaxBatch>>(BASE, {
      params: batchParams(query),
    });
    return data;
  },
  async getBatch(id: string): Promise<TaxBatch> {
    const { data } = await api.get<TaxBatch>(`${BASE}/${id}`);
    return data;
  },
  async createBatch(dto: CreateTaxBatchDto): Promise<TaxBatch> {
    const { data } = await api.post<TaxBatch>(BASE, dto);
    return data;
  },
  async addObligations(id: string, taxPayableIds: string[]): Promise<TaxBatch> {
    const { data } = await api.patch<TaxBatch>(`${BASE}/${id}/obligations/add`, {
      taxPayableIds,
    });
    return data;
  },
  async removeObligations(
    id: string,
    taxPayableIds: string[],
  ): Promise<TaxBatch> {
    const { data } = await api.patch<TaxBatch>(
      `${BASE}/${id}/obligations/remove`,
      { taxPayableIds },
    );
    return data;
  },
  /** Guarda los datos del comprobante ISLR del lote (N° + fecha de emisión). */
  async setComprobante(
    id: string,
    data: { comprobanteNumber: string; issueDate: string },
  ): Promise<TaxBatch> {
    const { data: batch } = await api.patch<TaxBatch>(
      `${BASE}/${id}/comprobante`,
      data,
    );
    return batch;
  },
  /** Fija (`taxUnitId`) o quita (`null`) el ajuste de UT del lote. */
  async setAdjustment(id: string, taxUnitId: string | null): Promise<TaxBatch> {
    const { data } = await api.patch<TaxBatch>(`${BASE}/${id}/adjustment`, {
      taxUnitId,
    });
    return data;
  },
  async registerPayment(
    id: string,
    payments: TaxPayablePaymentInput[],
  ): Promise<TaxBatch> {
    const { data } = await api.post<TaxBatch>(`${BASE}/${id}/payments`, {
      payments,
    });
    return data;
  },
  async editPayment(
    id: string,
    paymentId: string,
    dto: TaxPayablePaymentInput,
  ): Promise<TaxBatch> {
    const { data } = await api.patch<TaxBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
      dto,
    );
    return data;
  },
  async deletePayment(id: string, paymentId: string): Promise<TaxBatch> {
    const { data } = await api.delete<TaxBatch>(
      `${BASE}/${id}/payments/${paymentId}`,
    );
    return data;
  },
  async deleteBatch(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
