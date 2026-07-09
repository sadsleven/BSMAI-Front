export type OrderStatus =
  | 'draft'
  | 'in_progress'
  | 'attended'
  | 'report_issued'
  | 'finalized'
  | 'cancelled';

export type OrderType = 'cash' | 'credit' | 'insurance' | 'cashea';
export type ProviderType = 'doctor' | 'care_center';
export type InsuranceSource = 'direct' | 'via_contractor';
export type OrderPaymentType =
  | 'mobile_payment'
  | 'bank_transfer'
  | 'bank_transfer_usd'
  | 'card'
  | 'cash_usd'
  | 'cash_eur'
  | 'cash_bs'
  | 'other';
export type PaymentCurrency = 'USD' | 'EUR' | 'BS';

export interface OrderPayment {
  id?: string;
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  exchangeRateId?: string | null;
  accountNumber?: string | null;
  amountCurrency: PaymentCurrency;
  amountValue: number | string;
  amountInUsd?: number | string;
}

export interface OrderRefSummary {
  id: string;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  cedula?: string | null;
  rif?: string | null;
  birthDate?: string | null;
  address?: string | null;
  phones?: Array<{ id?: string; number: string; label?: string | null }>;
}

/** Observaciones del informe (Paso 3) de un proveedor. Mapea OrderProviderReport. */
export interface OrderProviderReportRow {
  id?: string;
  providerType: ProviderType;
  doctorId?: string | null;
  careCenterId?: string | null;
  observations?: string | null;
}

/** Orden interna: un número por proveedor distinto (mapea OrderInternalOrder del BE). */
export interface OrderInternalOrderRow {
  id: string;
  providerType: ProviderType;
  doctorId?: string | null;
  careCenterId?: string | null;
  /** Número de orden interna de este proveedor. */
  internalNumber: string;
  /** Ordinal 1-based dentro de la orden. `1` = proveedor del número base. */
  sequencePosition: number;
  /** Monto USD a pagar al proveedor (snapshot al facturar). Null hasta facturar. */
  providerAmountUsd?: string | number | null;
}

/** Fila ST + proveedor dentro de una orden (mapea OrderServiceType del BE). */
export interface OrderServiceTypeRow {
  serviceTypeId: string;
  serviceType?: { id: string; name: string };
  /** Nombre personalizado del ST en esta orden (override de serviceType.name). */
  customName?: string | null;
  providerType: ProviderType;
  doctorId?: string | null;
  doctor?:
    | (OrderRefSummary & { isLegalEntity?: boolean; centerAddress?: string | null })
    | null;
  careCenterId?: string | null;
  careCenter?: (OrderRefSummary & { centerAddress?: string | null }) | null;
  /** Cantidad del ST (≥1, default 1). Todo ST admite cantidad. */
  quantity?: number;
  /** ST indexado (tasa del día del cobro). Sólo con seguro no indexado (orden tasa fija). */
  isIndexed?: boolean;
  /** FK a la orden interna del proveedor de esta fila. */
  internalOrderId?: string;
  /** Orden interna (número) del proveedor de esta fila — para el N° por fila en facturación. */
  internalOrder?: OrderInternalOrderRow | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  branch?: { id: string; name: string };
  type: OrderType;
  status: OrderStatus;
  holderId: string;
  holder?: OrderRefSummary;
  patientId: string;
  patient?: OrderRefSummary;
  contractorId?: string | null;
  contractor?: { id: string; name: string } | null;
  insuranceId?: string | null;
  insurance?: {
    id: string;
    name: string;
    /** Nombre corto / abreviatura del seguro. Opcional. */
    shortName?: string | null;
    rif?: string | null;
    fiscalAddress?: string | null;
    phones?: Array<{ id?: string; number: string; label?: string | null }>;
  } | null;
  /** Origen del seguro: directo o vía contratista. Null para órdenes no-insurance. */
  insuranceSource?: InsuranceSource | null;
  /** Clave/referencia externa del seguro. Sólo type='insurance'. ≤30 chars. */
  serviceKey?: string | null;
  /** Orden de reembolso. Sólo type='credit'. Si true, la orden interna muestra "R". */
  isReimbursement?: boolean;
  specialtyId: string;
  specialty?: { id: string; name: string };
  /** Filas ST + proveedor. Reemplaza `serviceTypes` y los top-level provider fields. */
  orderServiceTypes?: OrderServiceTypeRow[];
  /** Órdenes internas: un número por proveedor distinto. */
  internalOrders?: OrderInternalOrderRow[];
  pathologies?: Array<{ id: string; name: string }>;
  orderDate: string;
  appointmentDate: string;
  priceAmount: string | number;
  /**
   * Snapshot Cashea al crear la orden. Sólo presentes cuando `type='cashea'`.
   * La inicial no genera comisión: comisión = total × commissionRate;
   * financiamiento = (total − inicial) × financingRate.
   */
  casheaFirstInstallmentAmount?: string | number | null;
  casheaCommissionRate?: string | number | null;
  casheaFinancingRate?: string | number | null;
  /**
   * Modo tasa fija para órdenes seguro. Cuando true, la cuenta por cobrar del
   * seguro se compara en Bs usando `fixedExchangeRate` (snapshot).
   */
  useFixedRate?: boolean;
  fixedExchangeRateId?: string | null;
  fixedExchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate: string;
  } | null;
  servicePricing?: Array<{
    serviceTypeId: string;
    kind: 'particular' | 'insurance' | 'doctor' | 'care_center';
    priceUsd: string | number;
  }>;
  createdById: string;
  createdBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    academicDegree?: string | null;
    jobTitle?: string | null;
  };
  payments?: OrderPayment[];
  // Paso 1 — autorización de monto por validador
  amountAuthorizedById?: string | null;
  amountAuthorizedAt?: string | null;
  amountAuthorizationNote?: string | null;
  amountAuthorizedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  // Pasos 2-4
  attended?: boolean;
  attendedAt?: string | null;
  /** Nota general de la orden (nivel orden, staff). */
  otherStudies?: string | null;
  /** Observaciones del informe segmentadas por proveedor (Paso 3). */
  providerReports?: OrderProviderReportRow[];
  /**
   * Sólo presente en la lista para usuarios proveedor: indica si SU propia
   * observación (Paso 3) ya está completa. El estado mostrado al proveedor se
   * deriva de este flag, no del `status` global de la orden.
   */
  providerObservationComplete?: boolean;
  doctorAmount?: string | number | null;
  billingExchangeRateId?: string | null;
  billingExchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate: string;
  } | null;
  invoiceNumber?: string | null;
  controlNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AttendOrderDto {
  attended: boolean;
  attendedAt?: string;
}

export interface AuthorizeOrderAmountDto {
  validatorEmail: string;
  validatorPassword: string;
  priceAmount: number;
  observation: string;
}

export interface ReportProviderInput {
  providerType: ProviderType;
  doctorId?: string;
  careCenterId?: string;
  observations?: string | null;
}

export interface ReportOrderDto {
  otherStudies?: string | null;
  providerReports?: ReportProviderInput[];
}

export interface BillingProviderInput {
  providerType: ProviderType;
  doctorId?: string;
  careCenterId?: string;
  amount: number;
}

export interface BillingOrderDto {
  providers: BillingProviderInput[];
  billingExchangeRateId: string;
  invoiceNumber: string;
  controlNumber: string;
}

export interface OrderServiceTypeRowInput {
  serviceTypeId: string;
  providerType: ProviderType;
  doctorId?: string;
  careCenterId?: string;
  quantity?: number;
  /** Nombre de este ST para la orden. Obligatorio. */
  customName: string;
  /** ST indexado (tasa del día del cobro). Sólo con seguro no indexado (orden tasa fija). */
  isIndexed?: boolean;
}

export interface CreateOrderDto {
  branchId: string;
  type: OrderType;
  holderId: string;
  patientId: string;
  contractorId?: string;
  insuranceId?: string;
  insuranceSource?: InsuranceSource;
  serviceKey?: string;
  isReimbursement?: boolean;
  specialtyId: string;
  serviceTypes: OrderServiceTypeRowInput[];
  pathologyIds?: string[];
  orderDate: string;
  appointmentDate: string;
  priceAmount: number;
  /** Monto de la primera cuota (inicial) Cashea, USD. Requerido si type='cashea'. */
  casheaFirstInstallmentAmount?: number;
  useFixedRate?: boolean;
  fixedExchangeRateId?: string;
  payments?: OrderPaymentInput[];
}

export type UpdateOrderDto = Partial<CreateOrderDto>;

export interface OrderPaymentInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  exchangeRateId?: string;
  accountNumber?: string;
  paymentAccountId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface OrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  type?: OrderType;
  branchId?: string;
  doctorId?: string;
  careCenterId?: string;
  specialtyId?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  appointmentDateFrom?: string;
  appointmentDateTo?: string;
  sortBy?: 'orderNumber' | 'orderDate' | 'appointmentDate' | 'priceAmount' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Borrador',
  in_progress: 'En proceso',
  attended: 'Atendida',
  report_issued: 'Informe emitido',
  finalized: 'Finalizada',
  cancelled: 'Cancelada',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  cash: 'Contado',
  credit: 'Crédito',
  insurance: 'Seguro',
  cashea: 'Cashea',
};

/**
 * Valor de "Clave de Servicio" para la orden interna (Paso 2). Las órdenes de
 * crédito marcadas como reembolso muestran "R"; el resto usa `serviceKey`
 * (que sólo persisten las órdenes de seguro). Vacío si no aplica.
 */
export function orderServiceKeyDisplay(order: {
  type?: OrderType;
  serviceKey?: string | null;
  isReimbursement?: boolean | null;
}): string {
  if (order.type === 'credit' && order.isReimbursement) return 'R';
  return order.serviceKey ?? '';
}

export const PAYMENT_TYPE_LABEL: Record<OrderPaymentType, string> = {
  mobile_payment: 'Pago móvil',
  bank_transfer: 'Transferencia',
  bank_transfer_usd: 'Transferencia en dólares',
  card: 'Punto (tarjeta)',
  cash_usd: 'Efectivo dólares',
  cash_eur: 'Efectivo euros',
  cash_bs: 'Efectivo bolívares',
  other: 'Otro',
};

/**
 * Todos los números de orden interna de una orden (uno por proveedor), ordenados
 * por `sequencePosition` con el base primero. Fallback al `orderNumber` base si
 * el BE no incluyó `internalOrders`.
 */
export function orderInternalNumbers(o: Order): string[] {
  const iio = o.internalOrders ?? [];
  if (!iio.length) return [o.orderNumber];
  return [...iio]
    .sort((a, b) => a.sequencePosition - b.sequencePosition)
    .map((x) => x.internalNumber);
}

export function holderDisplayName(p?: OrderRefSummary | null): string {
  if (!p) return '—';
  if (p.businessName) return p.businessName;
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—';
}

export function holderDisplayId(p?: OrderRefSummary | null): string {
  if (!p) return '';
  return p.cedula ?? p.rif ?? '';
}
