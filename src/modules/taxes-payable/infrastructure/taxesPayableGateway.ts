import { api } from '@/lib/api';
import type {
  PaginatedResponse,
  RegisterTaxPaymentDto,
  TaxPayable,
  TaxesPayableQuery,
} from '../domain/models/taxesPayable';

function buildParams(q: TaxesPayableQuery): Record<string, string | number | undefined> {
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

export const taxesPayableGateway = {
  async list(query: TaxesPayableQuery = {}): Promise<PaginatedResponse<TaxPayable>> {
    const { data } = await api.get<PaginatedResponse<TaxPayable>>('/taxes-payable', {
      params: buildParams(query),
    });
    return data;
  },
  async getById(id: string): Promise<TaxPayable> {
    const { data } = await api.get<TaxPayable>(`/taxes-payable/${id}`);
    return data;
  },
  async registerPayment(dto: RegisterTaxPaymentDto): Promise<TaxPayable[]> {
    const { data } = await api.post<TaxPayable[]>(
      '/taxes-payable/register-payment',
      dto,
    );
    return data;
  },
};
