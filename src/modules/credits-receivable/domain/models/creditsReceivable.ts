import type {
  Order,
  OrderPaymentType,
  OrderRefSummary,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type CreditsReceivableStatus =
  | 'collected'
  | 'uncollected'
  | 'partially_collected'
  | 'overcollected';

export interface CreditsReceivablePayment {
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

export interface CreditsReceivable {
  id: string;
  creditNumber: string;
  orderId: string;
  order: Order;
  holderId: string;
  holder: OrderRefSummary;
  status: CreditsReceivableStatus;
  collectedAt?: string | null;
  payments?: CreditsReceivablePayment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreditsReceivableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CreditsReceivableStatus;
  holderId?: string;
  branchId?: string;
  orderId?: string;
  sortBy?: 'orderNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface RegisterCreditCollectionInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface RegisterCreditCollectionDto {
  creditIds: string[];
  payments: RegisterCreditCollectionInput[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<CreditsReceivableStatus, string> = {
  collected: 'Cobrado',
  uncollected: 'No cobrado',
  partially_collected: 'Cobrado parcialmente',
  overcollected: 'Sobre-cobrado',
};

export function collectedBs(a: CreditsReceivable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

export function billingRateBs(a: CreditsReceivable): number | null {
  const r = a.order.billingExchangeRate;
  if (!r) return null;
  const n = Number(r.amountBs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function collectedOriginal(a: CreditsReceivable): number | null {
  const r = billingRateBs(a);
  if (r === null) return null;
  return collectedBs(a) / r;
}

export function targetBs(a: CreditsReceivable): number | null {
  const amount = Number(a.order.priceAmount);
  if (!Number.isFinite(amount)) return null;
  const r = billingRateBs(a);
  if (r === null) return null;
  return amount * r;
}

export function pendingBs(a: CreditsReceivable): number | null {
  const t = targetBs(a);
  if (t === null) return null;
  return t - collectedBs(a);
}

export function pendingOriginal(a: CreditsReceivable): number | null {
  const p = pendingBs(a);
  if (p === null) return null;
  const r = billingRateBs(a);
  if (r === null) return null;
  return p / r;
}

/** Display name del titular (jurídico = businessName, natural = firstName+lastName). */
export function holderDisplayName(h?: OrderRefSummary | null): string {
  if (!h) return '—';
  if (h.businessName?.trim()) return h.businessName.trim();
  const full = `${h.firstName ?? ''} ${h.lastName ?? ''}`.trim();
  return full || h.name || h.cedula || h.rif || '—';
}
