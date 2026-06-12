import type {
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';
import {
  calcRetention,
  type SeniatPersonType,
} from '@/lib/taxes/seniatRetention';

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

/** Suma Bs de los pagos asociados a la cuenta. */
export function paidBs(a: AccountsPayable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

/**
 * Bs ya pagado (parcial) en un grupo de cuentas, deduplicando pagos que estén
 * ligados a varias cuentas del grupo (un mismo pago aparece en cada cuenta).
 */
export function groupPaidBs(accounts: AccountsPayable[]): number {
  const byId = new Map<string, number>();
  for (const a of accounts) {
    for (const p of a.payments ?? []) byId.set(p.id, Number(p.amountInBs || 0));
  }
  let total = 0;
  for (const v of byId.values()) total += v;
  return Math.round(total * 100) / 100;
}

/** Régimen fiscal SENIAT del destinatario (espejo de BE `resolvePersonType`). */
export function personTypeOf(a: AccountsPayable): SeniatPersonType {
  if (a.recipientType === 'care_center') return 'legal_entity';
  return a.doctor?.isLegalEntity ? 'legal_entity' : 'natural';
}

/** Tasa USD/Bs de facturación de la orden. Null si aún no está facturada. */
export function billingRateBs(a: AccountsPayable): number | null {
  const r = Number(a.order?.billingExchangeRate?.amountBs);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * Neto USD estimado a entregar al proveedor (= bruto − retención SENIAT),
 * espejo del cálculo BE al registrar el pago. Exacto para pagos de una sola
 * cuenta; en lotes PNR el sustraendo aplica una vez por lote (acá se estima
 * por cuenta). Null sin providerAmount, tasa de facturación o UT.
 */
export function estimatedNetUsd(
  a: AccountsPayable,
  taxUnitBs: number | null | undefined,
): number | null {
  const gross = amountToReceiveUsd(a);
  if (gross === null) return null;
  const rate = billingRateBs(a);
  const ut = Number(taxUnitBs ?? 0);
  if (!rate || !Number.isFinite(ut) || ut <= 0) return null;
  const grossBs = Math.round(gross * rate * 100) / 100;
  const r = calcRetention({ grossBs, personType: personTypeOf(a), taxUnitBs: ut });
  const netBs = Math.round((grossBs - r.taxAmountBs) * 100) / 100;
  return Math.round((netBs / rate) * 100) / 100;
}

/**
 * Falta por pagar USD. El proveedor recibe el NETO (bruto − retención SENIAT),
 * por eso el pendiente se mide contra el neto estimado cuando hay UT y tasa;
 * sin esos datos cae al bruto. Cuenta `paid` → 0 (BE ya cuadró contra el neto).
 * Nunca negativo.
 */
export function pendingUsd(
  a: AccountsPayable,
  taxUnitBs?: number | null,
): number | null {
  if (a.status === 'paid') return 0;
  const target = estimatedNetUsd(a, taxUnitBs) ?? amountToReceiveUsd(a);
  if (target === null) return null;
  return Math.max(0, target - paidUsd(a));
}
