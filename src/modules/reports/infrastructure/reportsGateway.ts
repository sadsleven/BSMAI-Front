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

/** Un pago concreto del lote AP: banco, referencia y monto en Bs. */
export interface ReportPayablePayment {
  date: string | null;
  type: string;
  reference: string | null;
  bankCode: string | null;
  bankName: string | null;
  amountBs: number;
}

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
  payments: ReportPayablePayment[];
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

// ---- Facturas / Relación de ingresos (base: facturas emitidas) ----
export type InvoiceStatus = 'active' | 'cancelled';

/**
 * Una factura emitida. Puede agrupar varias órdenes del mismo contratante:
 * `amountUsd`/`costUsd` ya vienen sumados por el backend y son 0 si está
 * anulada (una factura anulada no es ingreso).
 */
export interface ReportInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  controlNumber: string;
  /** Fecha de emisión (YYYY-MM-DD). */
  invoiceDate: string;
  status: InvoiceStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string;
  orderId: string;
  orderNumber: string;
  orderType: string;
  orderDate: string;
  branchId: string;
  branchName: string | null;
  clientType: 'insurance' | 'holder';
  clientId: string | null;
  clientName: string;
  holderName: string;
  holderId: string;
  patientName: string;
  patientId: string;
  doctorName: string;
  serviceKey: string;
  /** N° de orden interna de cada proveedor cubierto, separados por coma. */
  internalNumbers: string;
  /** N° de las órdenes cubiertas por la factura, separados por coma. */
  orderNumbers: string;
  ordersCount: number;
  amountUsd: number;
  rateBs: number | null;
  amountBs: number | null;
  costUsd: number;
  marginUsd: number;
}

export interface ReportInvoiceSummary {
  count: number;
  activeCount: number;
  cancelledCount: number;
  amountUsd: number;
  amountBs: number;
  costUsd: number;
  marginUsd: number;
  avgUsd: number;
  /** Tasa promedio ponderada del período (Σ Bs / Σ $). */
  avgRateBs: number;
}

export interface ReportInvoiceClientRow {
  clientType: 'insurance' | 'holder';
  clientId: string | null;
  clientName: string;
  invoicesCount: number;
  amountUsd: number;
  amountBs: number;
  costUsd: number;
  marginUsd: number;
}

export interface IncomeRelationResult {
  rows: ReportInvoiceRow[];
  byClient: ReportInvoiceClientRow[];
  summary: ReportInvoiceSummary;
}

export interface InvoicesReportQuery extends ReportQuery {
  status?: InvoiceStatus | '';
  clientType?: 'insurance' | 'holder' | '';
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
  /** Rango de años seleccionable: orden más vieja → más nueva del sistema. */
  years: { min: number; max: number };
}

function params(
  q: ReportQuery & { groupBy?: string; clientType?: string },
): Record<string, string | undefined> {
  return {
    from: q.from,
    to: q.to,
    branchId: q.branchId,
    doctorId: q.doctorId,
    careCenterId: q.careCenterId,
    insuranceId: q.insuranceId,
    holderId: q.holderId,
    status: q.status || undefined,
    search: q.search,
    groupBy: q.groupBy,
    clientType: q.clientType || undefined,
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
  /** Facturas emitidas (vigentes y anuladas), de la más reciente a la más vieja. */
  async invoices(
    q: InvoicesReportQuery = {},
  ): Promise<ReportEnvelope<ReportInvoiceRow, ReportInvoiceSummary>> {
    const { data } = await api.get(`${BASE}/invoices`, { params: params(q) });
    return data;
  },
  /** Relación de ingresos: facturas en orden cronológico + desglose por cliente. */
  async incomeRelation(q: InvoicesReportQuery = {}): Promise<IncomeRelationResult> {
    const { data } = await api.get(`${BASE}/income-relation`, { params: params(q) });
    return data;
  },
  async arc(q: ReportQuery & { year?: string } = {}): Promise<ArcReport> {
    const { data } = await api.get(`${BASE}/arc`, {
      params: { ...params(q), year: q.year },
    });
    return data;
  },
};
