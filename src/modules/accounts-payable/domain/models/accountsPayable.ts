import type { Order, PaymentCurrency, OrderPaymentType } from '@/modules/orders/domain/models/order';

export type AccountsPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
export type RecipientType = 'doctor' | 'care_center';

export interface AccountsPayablePayment {
  id: string;
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  exchangeRateId?: string | null;
  amountCurrency: PaymentCurrency;
  amountValue: string | number;
  amountInBs: string | number;
  createdAt?: string;
}

export interface AccountsPayable {
  id: string;
  payableNumber: string;
  orderId: string;
  order: Order;
  recipientType: RecipientType;
  doctorId?: string | null;
  doctor?: { id: string; firstName?: string | null; lastName?: string | null; isLegalEntity?: boolean } | null;
  careCenterId?: string | null;
  careCenter?: { id: string; businessName?: string | null } | null;
  status: AccountsPayableStatus;
  paidAt?: string | null;
  payments?: AccountsPayablePayment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountsPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountsPayableStatus;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
  orderId?: string;
  sortBy?: 'orderNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface RegisterPaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface RegisterPaymentDto {
  payableIds: string[];
  payments: RegisterPaymentInput[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<AccountsPayableStatus, string> = {
  paid: 'Pagada',
  unpaid: 'No pagada',
  partially_paid: 'Pagada parcialmente',
};

export function recipientName(a: AccountsPayable): string {
  if (a.recipientType === 'doctor') {
    const d = a.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return a.careCenter?.businessName ?? '—';
}

/**
 * Calcula `amountToReceive` en moneda original del `doctorAmount`, restando tax si recipient = doctor.
 *
 * Las tasas pueden inyectarse desde `useTaxRates()` (`{ doctorNaturalTaxRate, doctorLegalTaxRate }`).
 * Si no se pasa `rates`, usa los defaults 0.03 / 0.05 (alineados con BE fallback).
 */
export function amountToReceive(
  a: AccountsPayable,
  rates?: { doctorNaturalTaxRate: number; doctorLegalTaxRate: number } | null,
): number | null {
  if (!a.order.doctorAmount) return null;
  const amount = Number(a.order.doctorAmount);
  if (a.recipientType === 'doctor') {
    const r = rates ?? { doctorNaturalTaxRate: 0.03, doctorLegalTaxRate: 0.05 };
    const taxRate = a.doctor?.isLegalEntity ? r.doctorLegalTaxRate : r.doctorNaturalTaxRate;
    return amount * (1 - taxRate);
  }
  return amount;
}
