import type {
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';
import type { SeniatPersonType } from '@/lib/taxes/seniatRetention';

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
  exchangeRate?: { id: string; currency: string; amountBs: string | number } | null;
  amountCurrency: PaymentCurrency;
  amountValue: string | number;
  amountInUsd: string | number;
  amountInBs: string | number;
  createdAt?: string;
}

/** Pivot lote ↔ orden interna del proveedor (con snapshot del bruto USD). */
export interface AccountsPayableOrder {
  payableId: string;
  internalOrderId: string;
  grossUsd: string | number;
  internalOrder?: {
    id?: string;
    internalNumber: string;
    providerType: RecipientType;
    order?: {
      id?: string;
      orderNumber: string;
      billingExchangeRate?: {
        id: string;
        currency: string;
        amountBs: string | number;
      } | null;
    } | null;
  } | null;
}

/** Orden interna facturada disponible para armar un lote (Pendiente). */
export interface PendingPayable {
  internalOrderId: string;
  internalNumber: string;
  orderId: string;
  orderNumber: string;
  providerType: RecipientType;
  doctorId: string | null;
  careCenterId: string | null;
  providerName: string;
  grossUsd: number;
  billingExchangeRateId: string | null;
  branchId: string;
  branchName: string | null;
  createdAt: string;
}

/** Lote de cuentas por pagar (un proveedor, N órdenes internas, M pagos). */
export interface AccountsPayableBatch {
  id: string;
  payableNumber: string;
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
  /** UT del cálculo de retención SENIAT del lote (null = UT vigente al calcular). */
  taxUnitId?: string | null;
  taxUnit?: { id: string; amountBs: string; effectiveDate: string } | null;
  /**
   * ¿El lote descuenta la retención de ISLR? `false` ⇒ neto = bruto y no nace
   * obligación SENIAT al pagarlo. Usa `batchAppliesRetention(b)` (undefined ⇒ sí).
   */
  applyRetention?: boolean;
  /**
   * Tasa de pago USD/Bs del lote: define bruto Bs, retención y neto a pagar.
   * null = tasa de facturación de cada orden (lotes previos).
   */
  exchangeRateId?: string | null;
  exchangeRate?: {
    id: string;
    currency: string;
    amountBs: string | number;
    effectiveDate?: string;
    isActive?: boolean;
  } | null;
  status: AccountsPayableStatus;
  paidAt?: string | null;
  /** Sólo en el detalle (`getBatch`); el listado manda `orderCount`. */
  orders?: AccountsPayableOrder[];
  payments: AccountsPayablePayment[];
  createdAt?: string;
  updatedAt?: string;
  // Transient (provistos por el BE).
  /** Nº de órdenes del lote (agregado por el BE, no requiere `orders`). */
  orderCount?: number;
  grossUsd?: number;
  grossBs?: number;
  retentionBs?: number;
  netBs?: number;
  paidBs?: number;
  pendingBs?: number;
}

export interface PendingPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
}

export interface AccountsPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountsPayableStatus;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
  sortBy?: 'payableNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface AccountsPayablePaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface CreateAccountsPayableBatchDto {
  recipientType: RecipientType;
  doctorId?: string;
  careCenterId?: string;
  /** UT para la retención SENIAT del lote. Sin enviar = UT vigente. */
  taxUnitId?: string;
  /** ¿Descontar la retención de ISLR? Sin enviar = `true`. */
  applyRetention?: boolean;
  /** Tasa de pago USD/Bs del lote. Sin enviar = tasa USD vigente. */
  exchangeRateId?: string;
  internalOrderIds: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<AccountsPayableStatus, string> = {
  paid: 'Pagado',
  unpaid: 'No pagado',
  partially_paid: 'Pagado parcialmente',
};

/** Nombre del proveedor (doctor o centro) de un lote. */
export function recipientName(b: AccountsPayableBatch): string {
  if (b.recipientType === 'doctor') {
    const d = b.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return b.careCenter?.businessName ?? '—';
}

/** Nombre del proveedor de una orden pendiente. */
export function pendingProviderName(p: PendingPayable): string {
  return p.providerName?.trim() || '—';
}

/** ¿El lote descuenta retención SENIAT? (espejo de BE `appliesRetention`; undefined ⇒ sí). */
export function batchAppliesRetention(b: AccountsPayableBatch): boolean {
  return b.applyRetention !== false;
}

/** Régimen fiscal SENIAT del destinatario (espejo de BE `personTypeOf`). */
export function personTypeOf(b: AccountsPayableBatch): SeniatPersonType {
  if (b.recipientType === 'care_center') return 'legal_entity';
  return b.doctor?.isLegalEntity ? 'legal_entity' : 'natural';
}

/** ID del proveedor de un lote (doctor o centro). */
export function batchProviderId(b: AccountsPayableBatch): string | null {
  return b.recipientType === 'doctor' ? b.doctorId ?? null : b.careCenterId ?? null;
}

/** ID del proveedor de una orden pendiente (doctor o centro). */
export function pendingProviderId(p: PendingPayable): string | null {
  return p.providerType === 'doctor' ? p.doctorId : p.careCenterId;
}

/** Número de orden interna del pivot. */
export function orderInternalNumber(o: AccountsPayableOrder): string {
  return o.internalOrder?.internalNumber ?? '—';
}

// ----------------------------------------------------------------------------
// Compat: los reportes consumen el listado de lotes como "cuentas". Estos
// helpers exponen los montos del lote (transient del BE) a nivel reporte.
// ----------------------------------------------------------------------------

/**
 * Tasa USD/Bs con la que el BE convierte el lote a Bs: la tasa de pago del
 * lote y, si no tiene (lotes previos), la de facturación de la primera orden.
 */
export function batchRateBs(b: AccountsPayableBatch): number | null {
  const own = Number(b.exchangeRate?.amountBs);
  if (Number.isFinite(own) && own > 0) return own;
  // El listado no trae el pivot: la tasa efectiva se deriva de los transient.
  const gUsd = Number(b.grossUsd);
  const gBs = Number(b.grossBs);
  if (Number.isFinite(gUsd) && gUsd > 0 && Number.isFinite(gBs) && gBs > 0)
    return gBs / gUsd;
  const r = Number(
    b.orders?.[0]?.internalOrder?.order?.billingExchangeRate?.amountBs,
  );
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * Falta por pagar en USD del lote (= `pendingBs` / tasa del lote). El
 * segundo argumento se acepta por compatibilidad con el cálculo anterior pero
 * se ignora: el BE ya descuenta la retención SENIAT en `pendingBs`.
 */
export function pendingUsd(
  b: AccountsPayableBatch,
  _taxUnitBs?: number | null,
): number {
  void _taxUnitBs;
  const rate = batchRateBs(b);
  const pBs = Number(b.pendingBs ?? 0);
  if (!rate || !Number.isFinite(pBs)) return 0;
  return Math.round((pBs / rate) * 100) / 100;
}
