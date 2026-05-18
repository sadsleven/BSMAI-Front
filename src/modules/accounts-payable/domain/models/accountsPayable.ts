import type {
  DoctorAmountCurrency,
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type AccountsPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
/** Status derivado en FE: incluye `undefined` cuando la orden aún no tiene doctorAmount. */
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
  /** Monto a pagar a este proveedor (en moneda original). Null mientras no se facture. */
  providerAmount?: string | number | null;
  providerAmountCurrency?: DoctorAmountCurrency | null;
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

/**
 * Status derivado: si la orden aún no tiene `doctorAmount` (null o 0), retorna `'undefined'`.
 * No se persiste; sólo display + bloqueo de selección.
 */
export function effectiveStatus(
  a: AccountsPayable,
): EffectiveAccountsPayableStatus {
  const amt = Number(a.providerAmount ?? 0);
  if (!a.providerAmount || !Number.isFinite(amt) || amt <= 0) {
    return 'undefined';
  }
  return a.status;
}

/** Selección/pago habilitado: no pagada y con monto definido. */
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
 * Calcula `amountToReceive` en moneda original del `doctorAmount`, restando tax si recipient = doctor.
 *
 * Las tasas pueden inyectarse desde `useTaxRates()` (`{ doctorNaturalTaxRate, doctorLegalTaxRate }`).
 * Si no se pasa `rates`, usa los defaults 0.03 / 0.05 (alineados con BE fallback).
 */
export function amountToReceive(
  a: AccountsPayable,
  rates?: { doctorNaturalTaxRate: number; doctorLegalTaxRate: number } | null,
): number | null {
  if (!a.providerAmount) return null;
  const amount = Number(a.providerAmount);
  if (a.recipientType === 'doctor') {
    const r = rates ?? { doctorNaturalTaxRate: 0.03, doctorLegalTaxRate: 0.05 };
    const taxRate = a.doctor?.isLegalEntity ? r.doctorLegalTaxRate : r.doctorNaturalTaxRate;
    return amount * (1 - taxRate);
  }
  return amount;
}

/** Suma en Bs de los pagos asociados a la cuenta. */
export function paidBs(a: AccountsPayable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

/** Tasa de facturación de la orden (Bs por unidad de moneda extranjera). */
export function billingRateBs(a: AccountsPayable): number | null {
  const r = a.order.billingExchangeRate;
  if (!r) return null;
  const n = Number(r.amountBs);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pagado convertido a moneda original del providerAmount. */
export function paidOriginal(a: AccountsPayable): number | null {
  const pBs = paidBs(a);
  if (a.providerAmountCurrency === 'BS') return pBs;
  const r = billingRateBs(a);
  if (r === null) return null;
  return pBs / r;
}

/** Monto objetivo en Bs (a recibir × tasa de facturación). */
export function targetBs(
  a: AccountsPayable,
  rates?: { doctorNaturalTaxRate: number; doctorLegalTaxRate: number } | null,
): number | null {
  const ar = amountToReceive(a, rates);
  if (ar === null) return null;
  if (a.providerAmountCurrency === 'BS') return ar;
  const r = billingRateBs(a);
  if (r === null) return null;
  return ar * r;
}

/** Pendiente en Bs. Nunca negativo (cap superior). */
export function pendingBs(
  a: AccountsPayable,
  rates?: { doctorNaturalTaxRate: number; doctorLegalTaxRate: number } | null,
): number | null {
  const t = targetBs(a, rates);
  if (t === null) return null;
  return Math.max(0, t - paidBs(a));
}

/** Pendiente en la moneda original del doctorAmount. */
export function pendingOriginal(
  a: AccountsPayable,
  rates?: { doctorNaturalTaxRate: number; doctorLegalTaxRate: number } | null,
): number | null {
  const p = pendingBs(a, rates);
  if (p === null) return null;
  if (a.providerAmountCurrency === 'BS') return p;
  const r = billingRateBs(a);
  if (r === null) return null;
  return p / r;
}
