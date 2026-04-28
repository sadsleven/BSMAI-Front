export type OrderStatus =
  | 'draft'
  | 'in_progress'
  | 'attended'
  | 'report_issued'
  | 'finalized'
  | 'cancelled';

export type OrderType = 'cash' | 'credit' | 'insurance' | 'cashea';
export type ProviderType = 'doctor' | 'care_center';
export type OrderCurrency = 'USD' | 'EUR';
export type OrderPaymentType =
  | 'mobile_payment'
  | 'bank_transfer'
  | 'cash_foreign'
  | 'cash_bs'
  | 'other';
export type PaymentCurrency = 'USD' | 'EUR' | 'BS';

export interface OrderPayment {
  id?: string;
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  exchangeRateId?: string | null;
  accountNumber?: string | null;
  amountCurrency: PaymentCurrency;
  amountValue: number | string;
  amountInBs?: number | string;
}

export interface OrderRefSummary {
  id: string;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  cedula?: string | null;
  rif?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  branch?: { id: string; name: string };
  type: OrderType;
  status: OrderStatus;
  holderId: string;
  holder?: OrderRefSummary;
  patientId: string;
  patient?: OrderRefSummary;
  contractorId?: string | null;
  contractor?: { id: string; name: string } | null;
  insuranceId?: string | null;
  insurance?: { id: string; name: string } | null;
  providerType: ProviderType;
  doctorId?: string | null;
  doctor?: OrderRefSummary | null;
  careCenterId?: string | null;
  careCenter?: OrderRefSummary | null;
  specialtyId: string;
  specialty?: { id: string; name: string };
  serviceTypeId: string;
  serviceType?: { id: string; name: string };
  pathologyId: string;
  pathology?: { id: string; name: string };
  orderDate: string;
  appointmentDate: string;
  priceCurrency: OrderCurrency;
  priceAmount: string | number;
  createdById: string;
  payments?: OrderPayment[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateOrderDto {
  branchId: string;
  type: OrderType;
  holderId: string;
  patientId: string;
  contractorId?: string;
  insuranceId?: string;
  providerType: ProviderType;
  doctorId?: string;
  careCenterId?: string;
  specialtyId: string;
  serviceTypeId: string;
  pathologyId: string;
  orderDate: string;
  appointmentDate: string;
  priceCurrency: OrderCurrency;
  priceAmount: number;
  payments?: OrderPaymentInput[];
}

export type UpdateOrderDto = Partial<CreateOrderDto>;

export interface OrderPaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  exchangeRateId?: string;
  accountNumber?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface OrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  type?: OrderType;
  branchId?: string;
  doctorId?: string;
  careCenterId?: string;
  specialtyId?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  appointmentDateFrom?: string;
  appointmentDateTo?: string;
  sortBy?: 'orderNumber' | 'orderDate' | 'appointmentDate' | 'priceAmount' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Borrador',
  in_progress: 'En proceso',
  attended: 'Atendida',
  report_issued: 'Informe emitido',
  finalized: 'Finalizada',
  cancelled: 'Cancelada',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  cash: 'Contado',
  credit: 'Crédito',
  insurance: 'Seguro',
  cashea: 'Cashea',
};

export const PAYMENT_TYPE_LABEL: Record<OrderPaymentType, string> = {
  mobile_payment: 'Pago móvil',
  bank_transfer: 'Transferencia',
  cash_foreign: 'Efectivo divisas',
  cash_bs: 'Efectivo bolívares',
  other: 'Otro',
};

export function holderDisplayName(p?: OrderRefSummary | null): string {
  if (!p) return '—';
  if (p.businessName) return p.businessName;
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—';
}

export function holderDisplayId(p?: OrderRefSummary | null): string {
  if (!p) return '';
  return p.cedula ?? p.rif ?? '';
}
