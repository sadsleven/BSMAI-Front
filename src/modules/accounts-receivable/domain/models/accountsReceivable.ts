import type {
  Order,
  OrderPaymentType,
  OrderRefSummary,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';
import { casheaCommissionCents } from '@/lib/money/cashea';

export type AccountsReceivableStatus =
  | 'collected'
  | 'uncollected'
  | 'partially_collected'
  | 'overcollected';

/** Tipo de deudor de la cuenta por cobrar. */
export type AccountsReceivableDebtorType = 'insurance' | 'holder';

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
  amountInUsd: string | number;
  amountInBs: string | number;
  createdAt?: string;
}

export interface AccountsReceivable {
  id: string;
  receivableNumber: string;
  orderId: string;
  order: Order;
  /** Seguro deudor (sólo si la orden es type='insurance'). XOR con `holder`. */
  insuranceId?: string | null;
  insurance?: { id: string; name: string } | null;
  /** Titular deudor (sólo si la orden es type='credit'). XOR con `insurance`. */
  holderId?: string | null;
  holder?: OrderRefSummary | null;
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
  holderId?: string;
  debtorType?: AccountsReceivableDebtorType;
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
  paymentAccountId?: string;
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

export const DEBTOR_TYPE_LABEL: Record<AccountsReceivableDebtorType, string> = {
  insurance: 'Seguro',
  holder: 'Titular (crédito)',
};

export function debtorTypeOf(a: AccountsReceivable): AccountsReceivableDebtorType {
  return a.holderId ? 'holder' : 'insurance';
}

export function debtorDisplayName(a: AccountsReceivable): string {
  if (a.holder) {
    if (a.holder.businessName?.trim()) return a.holder.businessName.trim();
    const full = `${a.holder.firstName ?? ''} ${a.holder.lastName ?? ''}`.trim();
    return full || a.holder.name || a.holder.cedula || a.holder.rif || '—';
  }
  return a.insurance?.name ?? '—';
}

/** Suma USD de los cobros asociados. */
export function collectedUsd(a: AccountsReceivable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInUsd || 0), 0);
}

/** Suma Bs de los cobros asociados. */
export function collectedBs(a: AccountsReceivable): number {
  return (a.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

/** True si la cuenta corresponde a una orden de seguro con tasa fija. */
export function isFixedRateAccount(a: AccountsReceivable): boolean {
  return !!a.order?.useFixedRate && !!a.order?.fixedExchangeRate;
}

/** Target Bs para cuentas con tasa fija. null si no aplica. */
export function targetBs(a: AccountsReceivable): number | null {
  if (!isFixedRateAccount(a)) return null;
  const price = Number(a.order.priceAmount);
  const rateBs = Number(a.order.fixedExchangeRate?.amountBs);
  if (!Number.isFinite(price) || !Number.isFinite(rateBs)) return null;
  return +(price * rateBs).toFixed(2);
}

/** Pendiente Bs. null si no aplica. */
export function pendingBs(a: AccountsReceivable): number | null {
  const t = targetBs(a);
  if (t === null) return null;
  return t - collectedBs(a);
}

/** True si la cuenta corresponde a una orden Cashea. */
export function isCasheaAccount(a: AccountsReceivable): boolean {
  return a.order?.type === 'cashea';
}

/**
 * Comisión Cashea total (USD) snapshot, en dos tramos = primeraCuota × firstRate
 * + total × totalRate. 0 si no aplica. Cálculo exacto en centavos enteros
 * (redondeo mitad-arriba) para evitar el drift de `toFixed`. Espeja
 * `casheaCommissionForOrder` del backend.
 */
export function casheaCommissionOf(a: AccountsReceivable): number {
  if (!isCasheaAccount(a)) return 0;
  const order = a.order;
  if (!order) return 0;
  const price = Number(order.priceAmount) || 0;
  const firstAmount = Number(order.casheaFirstInstallmentAmount) || 0;
  const firstRate = Number(order.casheaFirstInstallmentRate) || 0;
  const totalRate = Number(order.casheaTotalRate) || 0;
  return casheaCommissionCents(firstAmount, price, firstRate, totalRate) / 100;
}

/**
 * Target USD a cobrar. Para órdenes Cashea descuenta la comisión snapshot —
 * el comercio sólo espera el monto neto (precio − comisión). Para el resto de
 * tipos el target es priceAmount íntegro.
 */
export function targetUsd(a: AccountsReceivable): number | null {
  const amount = Number(a.order.priceAmount);
  if (!Number.isFinite(amount)) return null;
  if (isCasheaAccount(a)) {
    return +(amount - casheaCommissionOf(a)).toFixed(2);
  }
  return amount;
}

/** Pendiente USD. Puede ser negativo si overcollected. */
export function pendingUsd(a: AccountsReceivable): number | null {
  const t = targetUsd(a);
  if (t === null) return null;
  return t - collectedUsd(a);
}
