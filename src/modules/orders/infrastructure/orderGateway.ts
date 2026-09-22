import { api } from '@/lib/api';
import type {
  AttendOrderDto,
  AuthorizeOrderAmountDto,
  BillingOrderDto,
  CreateOrderDto,
  InvoiceableOrder,
  InvoiceNumberAvailability,
  IssueOrderInvoiceDto,
  Order,
  OrderChangeLog,
  OrderNumberAvailability,
  OrderPayment,
  OrderPaymentInput,
  OrdersQuery,
  PaginatedResponse,
  ReportOrderDto,
  ServiceKeyAvailability,
  UpdateOrderDto,
  UpdateProviderAmountsDto,
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
  /**
   * Disponibilidad de números de orden (Paso 1). Sin `number` devuelve sólo la
   * sugerencia (mayor en uso + 1). Con `number` + `count` (proveedores de la
   * orden) dice si el bloque consecutivo está libre y cuál es el próximo libre.
   */
  async numberAvailability(params: {
    number?: number;
    count?: number;
    orderId?: string;
  }): Promise<OrderNumberAvailability> {
    const { data } = await api.get<OrderNumberAvailability>(
      '/orders/numbers/availability',
      { params },
    );
    return data;
  },
  /**
   * Disponibilidad de una clave de servicio (Paso 1, órdenes de seguro). Es
   * única entre órdenes vivas y no se reutiliza: sólo queda libre si la orden
   * que la tenía fue cancelada. `orderId` excluye la propia orden.
   */
  async serviceKeyAvailability(params: {
    key: string;
    orderId?: string;
  }): Promise<ServiceKeyAvailability> {
    const { data } = await api.get<ServiceKeyAvailability>(
      '/orders/service-keys/availability',
      { params },
    );
    return data;
  },
  /**
   * Disponibilidad de un N° de factura (Paso 4). Sin `number` devuelve sólo la
   * sugerencia (el mayor emitido + 1). Los números no se reutilizan: el de una
   * factura anulada sigue ocupado. `orderId` no marca como ocupada la factura
   * vigente de esa misma orden.
   */
  async invoiceNumberAvailability(params: {
    number?: number;
    orderId?: string;
  }): Promise<InvoiceNumberAvailability> {
    const { data } = await api.get<InvoiceNumberAvailability>(
      '/orders/invoices/availability',
      { params },
    );
    return data;
  },
  /**
   * Órdenes que se pueden AGRUPAR en la misma factura que esta: mismo
   * contratante, mismo tipo, misma sucursal, ya finalizadas y sin factura
   * vigente. Alimenta el selector del Paso 4.
   */
  async invoiceableOrders(id: string): Promise<InvoiceableOrder[]> {
    const { data } = await api.get<InvoiceableOrder[]>(
      `/orders/${id}/invoiceable`,
    );
    return data;
  },
  /** Emite una factura nueva en una orden finalizada sin factura vigente. */
  async issueInvoice(id: string, dto: IssueOrderInvoiceDto): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/invoices`, dto);
    return data;
  },
  /** Anula una factura de la orden (la orden sigue activa). */
  async cancelInvoice(
    id: string,
    invoiceId: string,
    reason: string,
  ): Promise<Order> {
    const { data } = await api.patch<Order>(
      `/orders/${id}/invoices/${invoiceId}/cancel`,
      { reason },
    );
    return data;
  },
  /** Cambia el N° de una orden ya creada: renumera base + órdenes internas. */
  async changeNumber(id: string, number: number): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/number`, { number });
    return data;
  },
  // ----- Cancelación (conserva el número de la orden) -----
  async cancel(id: string, reason: string): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/cancel`, { reason });
    return data;
  },
  async uncancel(id: string): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/uncancel`);
    return data;
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
  /**
   * Corrige los montos a proveedor de una orden YA finalizada sin
   * re-facturarla. El BE lo rechaza si algún lote de CxP/CxC de la orden ya
   * tiene pagos registrados.
   */
  async updateProviderAmounts(
    id: string,
    dto: UpdateProviderAmountsDto,
  ): Promise<Order> {
    const { data } = await api.patch<Order>(
      `/orders/${id}/provider-amounts`,
      dto,
    );
    return data;
  },
};
