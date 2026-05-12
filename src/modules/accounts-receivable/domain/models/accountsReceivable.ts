import type {
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type AccountsReceivableStatus =
  | 'collected'
  | 'uncollected'
  | 'partially_collected'
  | 'overcollected';

export interface AccountsReceivablePayment {
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

export interface AccountsReceivable {
  id: string;
  receivableNumber: string;
  orderId: string;
  order: Order;
  insuranceId: string;
  insurance: { id: string; name: string };
  status: AccountsReceivableStatus;
  collectedAt?: string | null;
  payments?: AccountsReceivablePayment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountsReceivableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountsReceivableStatus;
  insuranceId?: string;
  branchId?: string;
  orderId?: string;
  sortBy?: 'orderNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface RegisterCollectionInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface RegisterCollectionDto {
  receivableIds: string[];
  payments: RegisterCollectionInput[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<AccountsReceivableStatus, string> = {
  collected: 'Cobrada',
  uncollected: 'No cobrada',
  partially_collected: 'Cobrada parcialmente',
  overcollected: 'Sobre-cobrada',
};

/** Suma en Bs de los cobros asociados. */
export function collectedBs(a: AccountsReceivable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

export function billingRateBs(a: AccountsReceivable): number | null {
  const r = a.order.billingExchangeRate;
  if (!r) return null;
  const n = Number(r.amountBs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cobrado convertido a moneda original (priceCurrency). */
export function collectedOriginal(a: AccountsReceivable): number | null {
  const r = billingRateBs(a);
  if (r === null) return null;
  return collectedBs(a) / r;
}

/** priceAmount de la orden convertido a Bs vía billing rate. */
export function targetBs(a: AccountsReceivable): number | null {
  const amount = Number(a.order.priceAmount);
  if (!Number.isFinite(amount)) return null;
  // priceCurrency es siempre USD/EUR — necesita rate.
  const r = billingRateBs(a);
  if (r === null) return null;
  return amount * r;
}

/** Pendiente en Bs. Puede ser negativo si overcollected. */
export function pendingBs(a: AccountsReceivable): number | null {
  const t = targetBs(a);
  if (t === null) return null;
  return t - collectedBs(a);
}

/** Pendiente en la moneda original (priceCurrency). */
export function pendingOriginal(a: AccountsReceivable): number | null {
  const p = pendingBs(a);
  if (p === null) return null;
  const r = billingRateBs(a);
  if (r === null) return null;
  return p / r;
}
