import { api } from '@/lib/api';
import type {
  AttendOrderDto,
  AuthorizeOrderAmountDto,
  BillingOrderDto,
  CreateOrderDto,
  Order,
  OrderChangeLog,
  OrderPayment,
  OrderPaymentInput,
  OrdersQuery,
  PaginatedResponse,
  ReportOrderDto,
  UpdateOrderDto,
} from '../domain/models/order';

function buildParams(q: OrdersQuery): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (q.page) out.page = String(q.page);
  if (q.limit) out.limit = String(q.limit);
  if (q.search) out.search = q.search;
  if (q.status) out.status = q.status;
  if (q.type) out.type = q.type;
  if (q.branchId) out.branchId = q.branchId;
  if (q.doctorId) out.doctorId = q.doctorId;
  if (q.careCenterId) out.careCenterId = q.careCenterId;
  if (q.specialtyId) out.specialtyId = q.specialtyId;
  if (q.orderDateFrom) out.orderDateFrom = q.orderDateFrom;
  if (q.orderDateTo) out.orderDateTo = q.orderDateTo;
  if (q.appointmentDateFrom) out.appointmentDateFrom = q.appointmentDateFrom;
  if (q.appointmentDateTo) out.appointmentDateTo = q.appointmentDateTo;
  if (q.sortBy) out.sortBy = q.sortBy;
  if (q.sortDir) out.sortDir = q.sortDir;
  if (q.withDeleted) out.withDeleted = 'true';
  if (q.onlyDeleted) out.onlyDeleted = 'true';
  return out;
}

export const orderGateway = {
  async list(query: OrdersQuery = {}): Promise<PaginatedResponse<Order>> {
    const { data } = await api.get<PaginatedResponse<Order>>('/orders', {
      params: buildParams(query),
    });
    return data;
  },
  async getById(id: string): Promise<Order> {
    const { data } = await api.get<Order>(`/orders/${id}`);
    return data;
  },
  /** Historial de cambios por usuario de la orden (más reciente primero). */
  async history(id: string): Promise<OrderChangeLog[]> {
    const { data } = await api.get<OrderChangeLog[]>(`/orders/${id}/history`);
    return data;
  },
  /**
   * Piso de la numeración automática (`ORDER_NUMBER_START`). Los números
   * manuales de órdenes históricas deben ser menores a este valor.
   */
  async numberStart(): Promise<number> {
    const { data } = await api.get<{ start: number }>('/orders/config/number-start');
    return Number(data?.start) || 1;
  },
  /** Nombres personalizados ya usados para un ST (autocompletar Paso 1). */
  async customNameSuggestions(serviceTypeId: string): Promise<string[]> {
    const { data } = await api.get<string[]>(
      `/orders/service-types/${serviceTypeId}/custom-names`,
    );
    return data;
  },
  async create(dto: CreateOrderDto): Promise<Order> {
    const { data } = await api.post<Order>('/orders', dto);
    return data;
  },
  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}`, dto);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/orders/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/orders/${id}/permanent`);
  },
  async restore(id: string): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/restore`);
    return data;
  },
  async addPayment(orderId: string, dto: OrderPaymentInput): Promise<OrderPayment> {
    const { data } = await api.post<OrderPayment>(`/orders/${orderId}/payments`, dto);
    return data;
  },
  async updatePayment(
    orderId: string,
    paymentId: string,
    dto: Partial<OrderPaymentInput>,
  ): Promise<OrderPayment> {
    const { data } = await api.patch<OrderPayment>(
      `/orders/${orderId}/payments/${paymentId}`,
      dto,
    );
    return data;
  },
  async removePayment(orderId: string, paymentId: string): Promise<void> {
    await api.delete(`/orders/${orderId}/payments/${paymentId}`);
  },
  // ----- Paso 1: autorización de monto por validador -----
  async authorizeAmount(id: string, dto: AuthorizeOrderAmountDto): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/authorize-amount`, dto);
    return data;
  },
  // ----- Pasos 2-4 -----
  async attend(id: string, dto: AttendOrderDto): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/attend`, dto);
    return data;
  },
  async report(id: string, dto: ReportOrderDto): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/report`, dto);
    return data;
  },
  async billing(id: string, dto: BillingOrderDto): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/billing`, dto);
    return data;
  },
};
