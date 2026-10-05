import type {
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';
import type { RecipientPaymentMethod } from '@/modules/orders/presentation/components/OrderPaymentForm';
import type { SeniatPersonType } from '@/lib/taxes/seniatRetention';

export type AccountsPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
export type RecipientType = 'doctor' | 'care_center';

/** Cuenta registrada del proveedor, tal como llega anidada en el lote. */
export interface ProviderPaymentMethod extends RecipientPaymentMethod {
  isActive?: boolean;
}

/** Fila de pago de un abono: el movimiento con el que se entregó parte del neto. */
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
  settlementId?: string;
  createdAt?: string;
}

/**
 * ABONO: una porción del bruto del lote en USD (`coveredUsd`) pagada a UNA tasa
 * (`rateBs`), con SU retención (`retentionBs`) y las filas de pago que entregan
 * su neto. Pagar un lote en dos partes a tasas distintas genera dos abonos
 * independientes — por eso cambiar la tasa de uno no recalcula el otro.
 */
export interface AccountsPayableSettlement {
  id: string;
  payableId: string;
  /** Fecha del abono: define el período fiscal de su retención. */
  settlementDate: string;
  coveredUsd: string | number;
  exchangeRateId: string;
  exchangeRate?: {
    id: string;
    currency: string;
    amountBs: string | number;
    effectiveDate?: string;
    isActive?: boolean;
  } | null;
  /** Snapshot de la tasa USD/Bs del abono. */
  rateBs: string | number;
  /** Bruto del abono en Bs (= coveredUsd × rateBs). */
  grossBs: string | number;
  personType: SeniatPersonType;
  taxUnitId?: string | null;
  taxUnit?: { id: string; amountBs: string; effectiveDate: string } | null;
  taxUnitAmountBs: string | number;
  taxRate: string | number;
  /** Sustraendo PRORRATEADO por la porción cubierta. */
  subtrahendBs: string | number;
  retentionBs: string | number;
  isCustomRetention: boolean;
  /** Neto entregado al proveedor (= grossBs − retentionBs). */
  netBs: string | number;
  payments: AccountsPayablePayment[];
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
    /** Cuentas registradas del proveedor (vienen con el lote: relación eager). */
    paymentMethods?: ProviderPaymentMethod[];
  } | null;
  careCenterId?: string | null;
  careCenter?: {
    id: string;
    businessName?: string | null;
    paymentMethods?: ProviderPaymentMethod[];
  } | null;
  /** UT del cálculo de retención SENIAT del lote (null = UT vigente al calcular). */
  taxUnitId?: string | null;
  taxUnit?: { id: string; amountBs: string; effectiveDate: string } | null;
  /**
   * ¿El lote descuenta la retención de ISLR? `false` ⇒ neto = bruto y no nace
   * obligación SENIAT al pagarlo. Usa `batchAppliesRetention(b)` (undefined ⇒ sí).
   */
  applyRetention?: boolean;
  /**
   * Tasa de pago USD/Bs POR DEFECTO: la que se propone a cada abono nuevo y con
   * la que se proyecta el saldo pendiente en Bs. NO afecta a los abonos ya
   * registrados. null = tasa de facturación de cada orden (lotes previos).
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
  /** Abonos del lote. Sólo en el detalle; el listado manda `settlementCount`. */
  settlements?: AccountsPayableSettlement[];
  createdAt?: string;
  updatedAt?: string;
  // Transient (provistos por el BE).
  /** Nº de órdenes del lote (agregado por el BE, no requiere `orders`). */
  orderCount?: number;
  /** Nº de abonos registrados. */
  settlementCount?: number;
  grossUsd?: number;
  /** USD del bruto ya cubiertos por abonos. */
  coveredUsd?: number;
  /** USD que faltan por pagar: EL saldo del lote (los Bs son derivados). */
  pendingUsd?: number;
  /** Bruto en Bs de los abonos, a la tasa de cada uno. */
  settledGrossBs?: number;
  /** Retención en Bs ya practicada en los abonos. */
  settledRetentionBs?: number;
  /** Bruto Bs: lo abonado + el saldo proyectado a la tasa por defecto. */
  grossBs?: number;
  /** Retención Bs: la practicada + la proyectada sobre el saldo. */
  retentionBs?: number;
  /** Neto Bs (= grossBs − retentionBs), con el saldo proyectado. */
  netBs?: number;
  /** Entregado al proveedor en Bs (Σ neto de los abonos). */
  paidBs?: number;
  /** Neto proyectado del saldo pendiente en Bs. */
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

/** Alta/edición de un abono: porción cubierta, tasa, retención y filas de pago. */
export interface AccountsPayableSettlementInput {
  settlementDate: string;
  /** USD del bruto del lote que cubre el abono. */
  coveredUsd: number;
  exchangeRateId: string;
  taxUnitId?: string;
  /** Monto manual de la retención (Bs). `null`/ausente = prorrateo automático. */
  customRetentionBs?: number | null;
  payments: AccountsPayablePaymentInput[];
}

export interface CreateAccountsPayableBatchDto {
  recipientType: RecipientType;
  doctorId?: string;
  careCenterId?: string;
  /** UT para la retención SENIAT del lote. Sin enviar = UT vigente. */
  taxUnitId?: string;
  /** ¿Descontar la retención de ISLR? Sin enviar = `true`. */
  applyRetention?: boolean;
  /** Tasa de pago USD/Bs por defecto del lote. Sin enviar = tasa USD vigente. */
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

/**
 * Cuentas activas del proveedor del lote, para precargar banco/cuenta al pagar.
 * Vienen anidadas en el propio lote (relación eager del BE): no hace falta un
 * request aparte al doctor o al centro.
 */
export function providerPaymentMethods(
  b: AccountsPayableBatch,
): RecipientPaymentMethod[] {
  const raw =
    (b.recipientType === 'doctor'
      ? b.doctor?.paymentMethods
      : b.careCenter?.paymentMethods) ?? [];
  return raw
    .filter((m) => m.isActive !== false && m.id)
    .map((m) => ({
      id: m.id,
      type: m.type,
      bankCode: m.bankCode,
      phoneNumber: m.phoneNumber,
      idDocument: m.idDocument,
      accountNumber: m.accountNumber,
      accountHolderName: m.accountHolderName,
      description: m.description,
    }));
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
 * Falta por pagar en USD del lote. Es el saldo autoritativo (el BE lo manda en
 * `pendingUsd`); el fallback deriva de `pendingBs` para respuestas viejas. El
 * segundo argumento se acepta por compatibilidad y se ignora.
 */
export function pendingUsd(
  b: AccountsPayableBatch,
  _taxUnitBs?: number | null,
): number {
  void _taxUnitBs;
  if (typeof b.pendingUsd === 'number' && Number.isFinite(b.pendingUsd)) {
    return b.pendingUsd;
  }
  const rate = batchRateBs(b);
  const pBs = Number(b.pendingBs ?? 0);
  if (!rate || !Number.isFinite(pBs)) return 0;
  return Math.round((pBs / rate) * 100) / 100;
}

/** Tasa USD/Bs de un abono (snapshot). */
export function settlementRateBs(s: AccountsPayableSettlement): number {
  const n = Number(s.rateBs);
  return Number.isFinite(n) && n > 0 ? n : Number(s.exchangeRate?.amountBs) || 0;
}

/**
 * Egreso real del abono en USD: el neto entregado al proveedor convertido a la
 * tasa del propio abono. Es el equivalente en USD del dinero que salió — no los
 * `coveredUsd`, que incluyen la retención que se quedó para el SENIAT.
 */
export function settlementNetUsd(s: AccountsPayableSettlement): number {
  const rate = settlementRateBs(s);
  if (!rate) return 0;
  return Math.round((Number(s.netBs || 0) / rate) * 100) / 100;
}
