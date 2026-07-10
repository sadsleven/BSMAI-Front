import { api } from '@/lib/api';

/** Filtros comunes a los reportes financieros. Fechas YYYY-MM-DD. */
export interface ReportQuery {
  from?: string;
  to?: string;
  branchId?: string;
  doctorId?: string;
  careCenterId?: string;
  insuranceId?: string;
  holderId?: string;
  status?: string;
  search?: string;
}

// ---- Payables ----
export type PayableObligationState =
  | 'sin_lote'
  | 'unpaid'
  | 'partially_paid'
  | 'paid';

export interface ReportPayableRow {
  orderId: string;
  orderNumber: string;
  internalNumber: string;
  orderDate: string;
  branchId: string;
  branchName: string | null;
  providerType: 'doctor' | 'care_center';
  providerId: string | null;
  providerName: string;
  patientName: string;
  insuranceName: string | null;
  procedure: string | null;
  facturacionUsd: number;
  personType: 'natural' | 'legal_entity';
  grossUsd: number;
  billingRateBs: number;
  grossBs: number;
  retentionBs: number;
  netBs: number;
  payableId: string | null;
  payableNumber: string | null;
  paymentDate: string | null;
  paymentReference: string | null;
  state: PayableObligationState;
}

export interface ReportPayableProviderRow {
  providerType: 'doctor' | 'care_center';
  providerId: string | null;
  providerName: string;
  ordersCount: number;
  lotesCount: number;
  grossUsd: number;
  grossBs: number;
  netBs: number;
  paidBs: number;
  pendingBs: number;
}

export interface ReportPayableSummary {
  count: number;
  grossUsd: number;
  grossBs: number;
  netBs: number;
  paidBs: number;
  pendingBs: number;
}

// ---- Receivables ----
export type ReceivableOrderState =
  | 'sin_lote'
  | 'uncollected'
  | 'partially_collected'
  | 'collected'
  | 'overcollected';

export interface ReportReceivableRow {
  orderId: string;
  orderNumber: string;
  orderType: string;
  orderDate: string;
  branchId: string;
  branchName: string | null;
  debtorType: 'insurance' | 'holder';
  debtorId: string | null;
  debtorName: string;
  holderName: string;
  holderId: string;
  patientName: string;
  patientId: string;
  doctorName: string;
  serviceKey: string;
  invoiceNumber: string;
  controlNumber: string;
  costoUsd: number;
  useFixedRate: boolean;
  rateBs: number | null;
  /** Porción de la orden (mixtas emiten fila `fixed` + `indexed`). */
  portion: 'full' | 'fixed' | 'indexed';
  targetUsd: number | null;
  targetBs: number | null;
  receivableId: string | null;
  receivableNumber: string | null;
  state: ReceivableOrderState;
}

export interface ReportReceivableDebtorRow {
  debtorType: 'insurance' | 'holder';
  debtorId: string | null;
  debtorName: string;
  ordersCount: number;
  lotesCount: number;
  targetUsd: number;
  targetBs: number;
  collectedUsd: number;
  collectedBs: number;
  pendingUsd: number;
  pendingBs: number;
}

export interface ReportReceivableSummary {
  count: number;
  targetUsd: number;
  targetBs: number;
  collectedUsd: number;
  collectedBs: number;
  pendingUsd: number;
  pendingBs: number;
}

// ---- Taxes retained ----
export type TaxObligationState = 'sin_lote' | 'unpaid' | 'partially_paid' | 'paid';

export interface ReportTaxRow {
  taxPayableId: string;
  taxPayableNumber: string;
  providerType: 'doctor' | 'care_center';
  providerId: string | null;
  providerName: string;
  personType: 'natural' | 'legal_entity';
  grossAmountBs: number;
  taxRate: number;
  taxAmountBs: number;
  internalNumbers: string[];
  taxBatchId: string | null;
  taxBatchNumber: string | null;
  state: TaxObligationState;
}

export interface ReportTaxSummary {
  count: number;
  taxAmountBs: number;
  paidBs: number;
  pendingBs: number;
}

// ---- Disbursements / Collections ----
export interface ReportPaymentRow {
  paymentId: string;
  paymentDate: string;
  type: string;
  referenceNumber: string | null;
  amountCurrency: 'USD' | 'EUR' | 'BS';
  amountValue: number;
  amountInUsd: number;
  amountInBs: number;
}
export interface ReportDisbursementRow extends ReportPaymentRow {
  payableNumber: string;
  providerName: string;
  providerType: 'doctor' | 'care_center';
}
export interface ReportCollectionRow extends ReportPaymentRow {
  receivableNumber: string;
  debtorName: string;
  /** `cashea` = lote sin seguro ni titular (deudor es la fintech). */
  debtorType: 'insurance' | 'holder' | 'cashea';
}
export interface ReportFlowSummary {
  count: number;
  totalUsd: number;
  totalBs: number;
}

// ---- Aging ----
export interface AgingBucketRow {
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  count: number;
  amountUsd: number;
  amountBs: number;
}
export interface ReportAgingResult {
  rows: { payable: AgingBucketRow[]; receivable: AgingBucketRow[] };
  summary: {
    payablePendingBs: number;
    receivablePendingUsd: number;
    receivablePendingBs: number;
  };
}

export interface ReportEnvelope<TRow, TSummary> {
  rows: TRow[];
  summary: TSummary;
}

// ---- ARC (Comprobante de Agente de Retención, Decreto 1.808) ----
export interface ArcLine {
  /** Fecha de pago o abono en cuenta (ISO). */
  paymentDate: string | null;
  /** Cantidad objeto de retención (base imponible) en Bs. */
  baseBs: number;
  /** % o tarifa aplicada. */
  ratePct: number;
  /** Impuesto retenido en Bs. */
  retainedBs: number;
  /** Total cantidad de retención acumulada (base) en Bs. */
  accBaseBs: number;
  /** Impuesto retenido acumulado en Bs. */
  accRetainedBs: number;
  /** Impuesto enterado — fecha (ISO) y banco. Null si aún no enterado. */
  enteradoDate: string | null;
  enteradoBank: string | null;
}

export interface ArcBeneficiary {
  providerType: 'doctor' | 'care_center';
  providerId: string | null;
  name: string;
  personType: 'natural' | 'legal_entity';
  cedula: string | null;
  rif: string | null;
  address: string | null;
  phone: string | null;
  lines: ArcLine[];
  totalBaseBs: number;
  totalRetainedBs: number;
}

export interface ArcReport {
  period: { from: string; to: string; year: number };
  beneficiaries: ArcBeneficiary[];
}

function params(q: ReportQuery & { groupBy?: string }): Record<string, string | undefined> {
  return {
    from: q.from,
    to: q.to,
    branchId: q.branchId,
    doctorId: q.doctorId,
    careCenterId: q.careCenterId,
    insuranceId: q.insuranceId,
    holderId: q.holderId,
    status: q.status,
    search: q.search,
    groupBy: q.groupBy,
  };
}

const BASE = '/reports';

export const reportsGateway = {
  async payables(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportPayableRow, ReportPayableSummary>> {
    const { data } = await api.get(`${BASE}/payables`, { params: params(q) });
    return data;
  },
  async payablesByProvider(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportPayableProviderRow, ReportPayableSummary>> {
    const { data } = await api.get(`${BASE}/payables`, {
      params: params({ ...q, groupBy: 'provider' }),
    });
    return data;
  },
  async receivables(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportReceivableRow, ReportReceivableSummary>> {
    const { data } = await api.get(`${BASE}/receivables`, { params: params(q) });
    return data;
  },
  async receivablesByDebtor(
    q: ReportQuery & { groupBy: 'insurance' | 'holder' },
  ): Promise<ReportEnvelope<ReportReceivableDebtorRow, ReportReceivableSummary>> {
    const { data } = await api.get(`${BASE}/receivables`, {
      params: params({ ...q, groupBy: q.groupBy }),
    });
    return data;
  },
  async taxesRetained(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportTaxRow, ReportTaxSummary>> {
    const { data } = await api.get(`${BASE}/taxes-retained`, { params: params(q) });
    return data;
  },
  async disbursements(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportDisbursementRow, ReportFlowSummary>> {
    const { data } = await api.get(`${BASE}/disbursements`, { params: params(q) });
    return data;
  },
  async collections(
    q: ReportQuery = {},
  ): Promise<ReportEnvelope<ReportCollectionRow, ReportFlowSummary>> {
    const { data } = await api.get(`${BASE}/collections`, { params: params(q) });
    return data;
  },
  async aging(q: ReportQuery = {}): Promise<ReportAgingResult> {
    const { data } = await api.get(`${BASE}/aging`, { params: params(q) });
    return data;
  },
  async arc(q: ReportQuery & { year?: string } = {}): Promise<ArcReport> {
    const { data } = await api.get(`${BASE}/arc`, {
      params: { ...params(q), year: q.year },
    });
    return data;
  },
};
