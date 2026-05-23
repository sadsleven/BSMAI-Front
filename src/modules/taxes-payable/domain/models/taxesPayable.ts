import type {
  DoctorAmountCurrency,
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type TaxPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
export type EffectiveTaxPayableStatus = TaxPayableStatus | 'undefined';
export type RecipientType = 'doctor' | 'care_center';

export interface TaxPayablePayment {
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

export interface TaxPayable {
  id: string;
  taxPayableNumber: string;
  accountsPayableId: string;
  orderId: string;
  order: Order;
  recipientType: RecipientType;
  doctorId?: string | null;
  doctor?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    isLegalEntity?: boolean;
  } | null;
  careCenterId?: string | null;
  careCenter?: { id: string; businessName?: string | null } | null;
  /** Monto del impuesto en moneda original. Null mientras no se factura. */
  taxAmount?: string | number | null;
  taxAmountCurrency?: DoctorAmountCurrency | null;
  taxRate?: string | number | null;
  status: TaxPayableStatus;
  paidAt?: string | null;
  payments?: TaxPayablePayment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaxesPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaxPayableStatus;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
  orderId?: string;
  sortBy?: 'orderNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface RegisterTaxPaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface RegisterTaxPaymentDto {
  taxPayableIds: string[];
  payments: RegisterTaxPaymentInput[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<TaxPayableStatus, string> = {
  paid: 'Pagada',
  unpaid: 'No pagada',
  partially_paid: 'Pagada parcialmente',
};

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveTaxPayableStatus, string> = {
  ...STATUS_LABEL,
  undefined: 'Sin definir',
};

export function effectiveStatus(t: TaxPayable): EffectiveTaxPayableStatus {
  const amt = Number(t.taxAmount ?? 0);
  if (!t.taxAmount || !Number.isFinite(amt) || amt <= 0) return 'undefined';
  return t.status;
}

export function canSelectForPayment(t: TaxPayable): boolean {
  const s = effectiveStatus(t);
  return s !== 'paid' && s !== 'undefined';
}

export function recipientName(t: TaxPayable): string {
  if (t.recipientType === 'doctor') {
    const d = t.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return t.careCenter?.businessName ?? '—';
}

/** Tasa de facturación de la orden (Bs por unidad de moneda extranjera). */
export function billingRateBs(t: TaxPayable): number | null {
  const r = t.order.billingExchangeRate;
  if (!r) return null;
  const n = Number(r.amountBs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Monto del impuesto (lo que se debe al fisco) en moneda original. */
export function taxAmount(t: TaxPayable): number | null {
  if (!t.taxAmount) return null;
  const n = Number(t.taxAmount);
  return Number.isFinite(n) ? n : null;
}

export function paidBs(t: TaxPayable): number {
  return (t.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

export function paidOriginal(t: TaxPayable): number | null {
  const pBs = paidBs(t);
  if (t.taxAmountCurrency === 'BS') return pBs;
  const r = billingRateBs(t);
  if (r === null) return null;
  return pBs / r;
}

export function targetBs(t: TaxPayable): number | null {
  const a = taxAmount(t);
  if (a === null) return null;
  if (t.taxAmountCurrency === 'BS') return a;
  const r = billingRateBs(t);
  if (r === null) return null;
  return a * r;
}

export function pendingBs(t: TaxPayable): number | null {
  const tg = targetBs(t);
  if (tg === null) return null;
  return Math.max(0, tg - paidBs(t));
}

export function pendingOriginal(t: TaxPayable): number | null {
  const p = pendingBs(t);
  if (p === null) return null;
  if (t.taxAmountCurrency === 'BS') return p;
  const r = billingRateBs(t);
  if (r === null) return null;
  return p / r;
}
