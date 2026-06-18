import type {
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type TaxBatchStatus = 'paid' | 'unpaid' | 'partially_paid';
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
  exchangeRate?: { id: string; currency: string; amountBs: string | number } | null;
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

/**
 * Obligación de retención (`taxes_payable`). Es la unidad "Pendiente" (sin lote)
 * o un elemento de las `obligations` de un lote SENIAT.
 */
export interface TaxObligation {
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
  taxUnitId?: string;
  taxUnit?: TaxPayableTaxUnit;
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
  status: TaxBatchStatus;
  paidAt?: string | null;
  sourcePayableId?: string | null;
  taxPaymentBatchId?: string | null;
  /** Números de orden interna del lote AP de origen (transient, lo provee el BE). */
  internalNumbers?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Lote SENIAT (N obligaciones de retención de uno o varios proveedores, M pagos). */
export interface TaxBatch {
  id: string;
  taxBatchNumber: string;
  status: TaxBatchStatus;
  paidAt?: string | null;
  obligations: TaxObligation[];
  payments: TaxPayablePayment[];
  createdAt?: string;
  updatedAt?: string;
  // Transient (provistos por el BE).
  targetBs?: number;
  paidBs?: number;
  pendingBs?: number;
}

export interface PendingTaxQuery {
  page?: number;
  limit?: number;
  search?: string;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
}

export interface TaxesPayableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaxBatchStatus;
  doctorId?: string;
  careCenterId?: string;
  branchId?: string;
  sortBy?: 'taxBatchNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface TaxPayablePaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface CreateTaxBatchDto {
  taxPayableIds: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<TaxBatchStatus, string> = {
  paid: 'Pagado',
  unpaid: 'No pagado',
  partially_paid: 'Pagado parcialmente',
};

export const PERSON_TYPE_LABEL: Record<TaxPayablePersonType, string> = {
  natural: 'Persona natural residente',
  legal_entity: 'Persona jurídica domiciliada',
};

/** Nombre del proveedor de una obligación. */
export function recipientName(t: {
  recipientType: RecipientType;
  doctor?: { firstName?: string | null; lastName?: string | null } | null;
  careCenter?: { businessName?: string | null } | null;
}): string {
  if (t.recipientType === 'doctor') {
    const d = t.doctor;
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—' : '—';
  }
  return t.careCenter?.businessName ?? '—';
}

/** Nombres de proveedores distintos de las obligaciones de un lote. */
export function batchProviderNames(b: TaxBatch): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const o of b.obligations ?? []) {
    const key = `${o.recipientType}:${obligationProviderId(o)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(recipientName(o));
  }
  return names;
}

/** Resumen de proveedores de un lote SENIAT para la UI. */
export function batchProvidersSummary(b: TaxBatch): string {
  const names = batchProviderNames(b);
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

/** ID del proveedor de una obligación pendiente (doctor o centro). */
export function obligationProviderId(t: TaxObligation): string | null {
  return t.recipientType === 'doctor' ? t.doctorId ?? null : t.careCenterId ?? null;
}

/** Retención en Bs de una obligación. */
export function taxAmountBs(t: TaxObligation): number {
  const n = Number(t.taxAmountBs);
  return Number.isFinite(n) ? n : 0;
}
