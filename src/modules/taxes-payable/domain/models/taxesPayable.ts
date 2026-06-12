import type {
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type TaxPayableStatus = 'paid' | 'unpaid' | 'partially_paid';
export type RecipientType = 'doctor' | 'care_center';
export type TaxPayablePersonType = 'natural' | 'legal_entity';

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

export interface TaxPayableTaxUnit {
  id: string;
  amountBs: string;
  effectiveDate: string;
}

export interface TaxPayableAccountsPayableRef {
  id: string;
  payableNumber: string;
  orderId: string;
  providerAmount?: string | number | null;
}

export interface TaxPayable {
  id: string;
  taxPayableNumber: string;
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
  personType: TaxPayablePersonType;
  taxUnitId: string;
  taxUnit: TaxPayableTaxUnit;
  /** Snapshot del valor UT (Bs) usado para el cálculo. */
  taxUnitAmountBs: string | number;
  /** Base imponible en Bs. */
  grossAmountBs: string | number;
  /** Tasa aplicada (0.03 / 0.05). */
  taxRate: string | number;
  /** Sustraendo en Bs (sólo PNR). */
  subtrahendBs: string | number;
  /** Retención en Bs (≥ 0). */
  taxAmountBs: string | number;
  status: TaxPayableStatus;
  paidAt?: string | null;
  /** Órdenes contenidas en la factura agrupada del pago. */
  orders?: Order[];
  /** AP cubiertas por el pago al proveedor que originó la retención. */
  accountsPayables?: TaxPayableAccountsPayableRef[];
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
  sortBy?: 'taxPayableNumber' | 'taxAmountBs' | 'grossAmountBs' | 'createdAt' | 'updatedAt';
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
  paid: 'Pagado',
  unpaid: 'No pagado',
  partially_paid: 'Pagado parcialmente',
};

export const PERSON_TYPE_LABEL: Record<TaxPayablePersonType, string> = {
  natural: 'Persona natural residente',
  legal_entity: 'Persona jurídica domiciliada',
};

export function canSelectForPayment(t: TaxPayable): boolean {
  return t.status !== 'paid';
}

export function recipientName(t: TaxPayable): string {
  if (t.recipientType === 'doctor') {
    const d = t.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return t.careCenter?.businessName ?? '—';
}

/** Retención en Bs. */
export function taxAmountBs(t: TaxPayable): number {
  const n = Number(t.taxAmountBs);
  return Number.isFinite(n) ? n : 0;
}

/** Suma Bs de pagos aplicados al SENIAT. */
export function paidBs(t: TaxPayable): number {
  return (t.payments ?? []).reduce((s, p) => s + Number(p.amountInBs || 0), 0);
}

/** Pendiente Bs. */
export function pendingBs(t: TaxPayable): number {
  return Math.max(0, taxAmountBs(t) - paidBs(t));
}
