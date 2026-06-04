import type {
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type AccountsPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
/** Status derivado en FE: incluye `undefined` cuando la orden aún no tiene providerAmount. */
export type EffectiveAccountsPayableStatus = AccountsPayableStatus | 'undefined';
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
  amountInUsd: string | number;
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
  /** Monto USD a pagar al proveedor. Null mientras no se factura. */
  providerAmount?: string | number | null;
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

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveAccountsPayableStatus, string> = {
  ...STATUS_LABEL,
  undefined: 'Sin definir',
};

export function effectiveStatus(
  a: AccountsPayable,
): EffectiveAccountsPayableStatus {
  const amt = Number(a.providerAmount ?? 0);
  if (!a.providerAmount || !Number.isFinite(amt) || amt <= 0) {
    return 'undefined';
  }
  return a.status;
}

export function canSelectForPayment(a: AccountsPayable): boolean {
  const s = effectiveStatus(a);
  return s !== 'paid' && s !== 'undefined';
}

export function recipientName(a: AccountsPayable): string {
  if (a.recipientType === 'doctor') {
    const d = a.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return a.careCenter?.businessName ?? '—';
}

/**
 * Monto USD bruto a pagar al proveedor (= providerAmount). La retención
 * SENIAT se aplica al lote al registrar el pago — ya no se descuenta acá.
 */
export function amountToReceiveUsd(a: AccountsPayable): number | null {
  if (!a.providerAmount) return null;
  const amount = Number(a.providerAmount);
  if (!Number.isFinite(amount)) return null;
  return amount;
}

/** Suma USD de los pagos asociados a la cuenta. */
export function paidUsd(a: AccountsPayable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInUsd || 0), 0);
}

/** Pendiente USD bruto. Nunca negativo. */
export function pendingUsd(a: AccountsPayable): number | null {
  const t = amountToReceiveUsd(a);
  if (t === null) return null;
  return Math.max(0, t - paidUsd(a));
}
