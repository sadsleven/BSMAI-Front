import type {
  OrderPaymentType,
  OrderRefSummary,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type AccountsReceivableStatus =
  | 'collected'
  | 'uncollected'
  | 'partially_collected'
  | 'overcollected';

/**
 * Tipo de deudor de la cuenta por cobrar. `cashea` = paga la fintech: el lote
 * puede agrupar órdenes cashea de titulares distintos (lote sin insuranceId ni
 * holderId).
 */
export type AccountsReceivableDebtorType = 'insurance' | 'holder' | 'cashea';

export interface AccountsReceivablePayment {
  id: string;
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  exchangeRateId?: string | null;
  exchangeRate?: { id: string; currency: string; amountBs: string | number } | null;
  paymentAccountId?: string | null;
  amountCurrency: PaymentCurrency;
  amountValue: string | number;
  amountInUsd: string | number;
  amountInBs: string | number;
  createdAt?: string;
}

/** Pivot lote ↔ orden (snapshot de modo y target). */
export interface AccountsReceivableOrder {
  receivableId: string;
  orderId: string;
  useFixedRate: boolean;
  targetUsd?: string | number | null;
  targetBs?: string | number | null;
  /** Datos de la orden (el detalle del lote los carga completos para el estado de cuenta). */
  order?: {
    id?: string;
    orderNumber: string;
    type?: string;
    orderDate?: string;
    createdAt?: string;
    serviceKey?: string | null;
    invoiceNumber?: string | null;
    controlNumber?: string | null;
    priceAmount?: string | number;
    useFixedRate?: boolean;
    fixedExchangeRate?: { id: string; amountBs: string | number } | null;
    /** Snapshot Cashea de la orden (sólo type='cashea'; alimenta el desglose del lote). */
    casheaFirstInstallmentAmount?: string | number | null;
    casheaCommissionRate?: string | number | null;
    casheaFinancingRate?: string | number | null;
    holder?: OrderRefSummary | null;
    patient?: OrderRefSummary | null;
  } | null;
}

/** Orden finalizada con deudor, disponible para armar un lote (Pendiente). */
export interface PendingReceivable {
  orderId: string;
  orderNumber: string;
  orderType: string;
  debtorType: AccountsReceivableDebtorType;
  insuranceId: string | null;
  holderId: string | null;
  debtorName: string;
  useFixedRate: boolean;
  targetUsd: number | null;
  targetBs: number | null;
  branchId: string;
  branchName: string | null;
  createdAt: string;
}

/** Lote de cuentas por cobrar (un deudor, N órdenes, M cobros). */
export interface AccountsReceivableBatch {
  id: string;
  receivableNumber: string;
  insuranceId?: string | null;
  insurance?: { id: string; name: string } | null;
  holderId?: string | null;
  holder?: OrderRefSummary | null;
  status: AccountsReceivableStatus;
  collectedAt?: string | null;
  orders: AccountsReceivableOrder[];
  payments: AccountsReceivablePayment[];
  createdAt?: string;
  updatedAt?: string;
  // Transient (provistos por el BE).
  mode?: 'usd' | 'fixed';
  targetUsd?: number;
  targetBs?: number;
  collectedUsd?: number;
  collectedBs?: number;
  pendingUsd?: number;
  pendingBs?: number;
}

export interface PendingReceivableQuery {
  page?: number;
  limit?: number;
  search?: string;
  debtorType?: AccountsReceivableDebtorType;
  insuranceId?: string;
  holderId?: string;
  branchId?: string;
}

export interface AccountsReceivableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountsReceivableStatus;
  insuranceId?: string;
  holderId?: string;
  debtorType?: AccountsReceivableDebtorType;
  branchId?: string;
  sortBy?: 'receivableNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface AccountsReceivablePaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  paymentAccountId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface CreateAccountsReceivableBatchDto {
  debtorType: AccountsReceivableDebtorType;
  /** Omitidos cuando debtorType === 'cashea'. */
  insuranceId?: string;
  holderId?: string;
  orderIds: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<AccountsReceivableStatus, string> = {
  collected: 'Cobrado',
  uncollected: 'No cobrado',
  partially_collected: 'Cobrado parcialmente',
  overcollected: 'Sobre-cobrado',
};

export const DEBTOR_TYPE_LABEL: Record<AccountsReceivableDebtorType, string> = {
  insurance: 'Seguro',
  holder: 'Titular (crédito)',
  cashea: 'Cashea',
};

export function debtorTypeOf(b: AccountsReceivableBatch): AccountsReceivableDebtorType {
  if (b.holderId) return 'holder';
  if (b.insuranceId) return 'insurance';
  return 'cashea';
}

export function debtorDisplayName(b: AccountsReceivableBatch): string {
  if (b.holder) {
    if (b.holder.businessName?.trim()) return b.holder.businessName.trim();
    const full = `${b.holder.firstName ?? ''} ${b.holder.lastName ?? ''}`.trim();
    return full || b.holder.name || b.holder.cedula || b.holder.rif || '—';
  }
  if (b.insurance) return b.insurance.name ?? '—';
  return 'Cashea';
}

/** ID del deudor del lote (seguro o titular). */
export function batchDebtorId(b: AccountsReceivableBatch): string | null {
  return b.holderId ?? b.insuranceId ?? null;
}

/** Modo de cobro del lote: 'fixed' (Bs tasa fija) o 'usd'. */
export function batchMode(b: AccountsReceivableBatch): 'usd' | 'fixed' {
  return b.mode ?? 'usd';
}

/** Nombre del deudor de una orden pendiente. */
export function pendingDebtorName(p: PendingReceivable): string {
  return p.debtorName?.trim() || '—';
}

/** ID del deudor de una orden pendiente (seguro o titular; cashea no tiene). */
export function pendingDebtorId(p: PendingReceivable): string | null {
  if (p.debtorType === 'holder') return p.holderId;
  if (p.debtorType === 'insurance') return p.insuranceId;
  return null;
}

/**
 * Clave de agrupación para armar un lote: mismo deudor y mismo modo (tasa fija
 * vs USD). Las órdenes cashea agrupan juntas aunque sean de titulares distintos.
 */
export function pendingBatchKey(p: PendingReceivable): string {
  const debtorId = p.debtorType === 'cashea' ? '' : pendingDebtorId(p) ?? '';
  return `${p.debtorType}:${debtorId}:${p.useFixedRate}`;
}

/** Etiqueta corta del tipo de deudor de una orden pendiente. */
export function pendingDebtorTypeLabel(p: PendingReceivable): string {
  return p.debtorType === 'holder'
    ? 'Titular'
    : p.debtorType === 'cashea'
      ? 'Cashea'
      : 'Seguro';
}

// ----------------------------------------------------------------------------
// Compat: los reportes consumen el listado de lotes como "cuentas". Estos
// helpers exponen los montos USD provistos por el BE (transient) a nivel lote.
// ----------------------------------------------------------------------------

/** Alias de compatibilidad para reportes que tipaban `AccountsReceivable`. */
export type AccountsReceivable = AccountsReceivableBatch;

/** Objetivo USD del lote (transient del BE). 0 en modo tasa fija. */
export function targetUsd(b: AccountsReceivableBatch): number {
  return Number(b.targetUsd ?? 0);
}

/** Cobrado USD del lote (transient del BE). */
export function collectedUsd(b: AccountsReceivableBatch): number {
  return Number(b.collectedUsd ?? 0);
}

/** Pendiente USD del lote (transient del BE). */
export function pendingUsd(b: AccountsReceivableBatch): number {
  return Number(b.pendingUsd ?? 0);
}
