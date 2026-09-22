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
  /** Tasa snapshot del pago (USD/Bs para pagos en Bs, EUR/Bs para efectivo euros). */
  exchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate?: string;
  } | null;
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
  /** Especialidad de esta fila (la orden interna del Paso 2 imprime la de sus filas). */
  specialtyId?: string;
  specialty?: { id: string; name: string };
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
   * Monto base = suma de los precios de catálogo (baremo del seguro para
   * órdenes de seguro; Particular para el resto), snapshot al guardar. El
   * ajuste es derivado: `priceAmount − priceBaseAmount` (negativo descuento,
   * positivo recargo). Null en órdenes previas a la migración de ajuste.
   */
  priceBaseAmount?: string | number | null;
  /** Trazabilidad del ajuste de monto (Paso 1): motivo, autor y fecha. */
  priceAdjustmentNote?: string | null;
  priceAdjustedById?: string | null;
  priceAdjustedAt?: string | null;
  priceAdjustedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
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
  /**
   * Tasa USD/Bs elegida en el Paso 4 para emitir la factura. Manda sobre
   * cualquier otra al imprimir. Nula en órdenes facturadas antes de que la tasa
   * fuese seleccionable (conservan la precedencia histórica).
   */
  invoiceExchangeRateId?: string | null;
  invoiceExchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate: string;
  } | null;
  /**
   * Espejo de la factura VIGENTE. Quedan en null si esa factura se anula y la
   * orden todavía no emitió otra.
   */
  invoiceNumber?: string | null;
  controlNumber?: string | null;
  /** Fecha impresa en la factura (Paso 4). Sin valor → cae a `orderDate`. */
  invoiceDate?: string | null;
  /**
   * ¿La factura imprime la fila "Tasa de cambio BCV"? Switch del Paso 4 (sólo
   * seguros). `null` → regla derivada `!useFixedRate`.
   */
  invoiceShowExchangeRate?: boolean | null;
  /** Facturas emitidas: la vigente + las anuladas (más antigua primero). */
  invoices?: OrderInvoice[];
  /**
   * Cancelación (reversible): la orden conserva su número y contenido pero
   * queda fuera del flujo. `cancelledAt` no nulo ⇔ `status='cancelled'`.
   * `statusBeforeCancel` es el estado al que vuelve si se reactiva.
   */
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelledById?: string | null;
  cancelledBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  statusBeforeCancel?: OrderStatus | null;
  /**
   * Candado de edición derivado de los lotes de CxP/CxC de la orden (lo calcula
   * el BE en el detalle). `locked` cuando algún lote suyo YA tiene pagos o
   * cobros registrados: ahí los servicios del Paso 1 y la liquidación del Paso
   * 4 quedan congelados. Un lote pendiente (sin pagos) no bloquea.
   */
  editLocks?: {
    locked: boolean;
    payableBatches: string[];
    receivableBatches: string[];
  };
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

/** Orden cubierta por una factura (en una agrupada hay varias). */
export interface InvoiceCoveredOrder {
  id: string;
  orderNumber: string;
  /** `YYYY-MM-DD`. */
  orderDate: string;
  priceAmount: string | number;
}

/**
 * Factura emitida en el Paso 4. Una orden puede acumular varias: a lo sumo una
 * vigente más las anuladas. Anular una factura NO cancela la orden, y su número
 * queda quemado para siempre (no se reutiliza).
 *
 * Una misma factura puede AGRUPAR varias órdenes del mismo contratante
 * (`coveredOrders`): `orderId` es sólo la orden EMISORA.
 */
export interface OrderInvoice {
  id: string;
  /** Orden EMISORA. Las órdenes que cubre están en `coveredOrders`. */
  orderId: string;
  /** Órdenes que cubre esta factura (incluye la emisora). */
  coveredOrders?: InvoiceCoveredOrder[];
  /** Valor numérico del N° de factura (null en facturas históricas). */
  number?: string | number | null;
  /** N° impreso, con ceros a la izquierda. */
  invoiceNumber: string;
  /** N° de control derivado (`número + 50` con dos ceros delante). */
  controlNumber: string;
  invoiceDate: string;
  /** ¿Esta factura imprime la tasa? `null` → regla derivada. */
  showExchangeRate?: boolean | null;
  exchangeRateId?: string | null;
  exchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate: string;
  } | null;
  status: 'active' | 'cancelled';
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelledBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  createdBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  createdAt?: string;
}

/** Dígitos con los que se imprime el N° de factura (`4912` → `04912`). */
export const INVOICE_NUMBER_PAD = 5;
/** El N° de control va 50 por delante del de factura… */
export const INVOICE_CONTROL_OFFSET = 50;
/** …y con dos ceros extra adelante (`04912` → `0004962`). Espejo del BE. */
export const INVOICE_CONTROL_PREFIX = '00';

/** N° de factura impreso: entero con ceros a la izquierda. */
export function formatInvoiceNumber(n: number): string {
  return String(Math.trunc(n)).padStart(INVOICE_NUMBER_PAD, '0');
}

/**
 * N° de control DERIVADO del de factura (no se captura a mano): mismo número
 * + 50, con dos ceros delante. `04912` → `0004962`.
 */
export function deriveControlNumber(n: number): string {
  return (
    INVOICE_CONTROL_PREFIX +
    formatInvoiceNumber(Math.trunc(n) + INVOICE_CONTROL_OFFSET)
  );
}

/** Factura vigente de la orden (la que se imprime), o null si no tiene. */
export function activeInvoice(order: Pick<Order, 'invoices'>): OrderInvoice | null {
  return (order.invoices ?? []).find((i) => i.status === 'active') ?? null;
}

/** ¿La factura agrupa más de una orden? */
export function isGroupedInvoice(invoice: OrderInvoice): boolean {
  return (invoice.coveredOrders ?? []).length > 1;
}

/**
 * Órdenes AGRUPADAS en la factura distintas de `orderId` (las "otras" que
 * salen en el mismo documento).
 */
export function otherCoveredOrders(
  invoice: OrderInvoice,
  orderId: string,
): InvoiceCoveredOrder[] {
  return (invoice.coveredOrders ?? []).filter((o) => o.id !== orderId);
}

/**
 * Candidata a agruparse en la misma factura: orden finalizada del **mismo
 * titular** que todavía no tiene factura vigente. El tipo de orden y la
 * sucursal no restringen (`GET /orders/:id/invoiceable`).
 */
export interface InvoiceableOrder {
  id: string;
  orderNumber: string;
  /** `YYYY-MM-DD`. */
  orderDate: string;
  priceAmount: string | number;
  serviceKey: string | null;
  patientName: string;
  /** Tipo de la orden candidata: una factura agrupada puede mezclar tipos. */
  orderType: OrderType;
  /** Sucursal de la orden candidata (puede no ser la de la emisora). */
  branchName: string | null;
  serviceTypesCount: number;
}

/** Disponibilidad de un N° de factura (Paso 4). */
export interface InvoiceNumberAvailability {
  /** Valor por defecto: el mayor emitido + 1. */
  suggestion: number;
  number: number | null;
  /** `null` cuando no se consultó un número concreto. */
  available: boolean | null;
  /** El número lo tiene una factura ANULADA (tampoco se reutiliza). */
  cancelled: boolean;
  /** N° de la orden que ya usa ese número, si está ocupado. */
  usedByOrderNumber: string | null;
  /** Primer número libre ≥ el pedido. */
  nextFree: number;
  invoiceNumber: string | null;
  controlNumber: string | null;
}

export interface IssueOrderInvoiceDto {
  invoiceNumber: number;
  /** `YYYY-MM-DD`. Sin enviar, el BE usa la fecha de la orden. */
  invoiceDate?: string;
  /** Tasa USD/Bs de la nueva factura. Sin enviar conserva la de la orden. */
  exchangeRateId?: string;
  /** ¿Imprime la fila "Tasa de cambio BCV"? Sin enviar, la regla derivada. */
  showExchangeRate?: boolean;
  /**
   * Órdenes ADICIONALES que cubre esta misma factura (factura agrupada). La
   * orden de la ruta va incluida siempre; no hace falta repetirla.
   */
  coveredOrderIds?: string[];
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

/**
 * Corrección de la liquidación de una orden ya finalizada (Paso 4). Manda
 * TODOS los proveedores de la orden; no toca factura, tasa ni estado.
 */
export interface UpdateProviderAmountsDto {
  providers: BillingProviderInput[];
}

export interface BillingOrderDto {
  providers: BillingProviderInput[];
  /**
   * Tasa USD/Bs elegida para emitir la factura. El BE la guarda como tasa de
   * facturación, tasa de la factura y —en seguro no indexado— tasa fija de la
   * cuenta por cobrar.
   */
  billingExchangeRateId: string;
  /**
   * ¿Se emite factura al finalizar? Obligatoria en seguro (el BE la fuerza);
   * opcional en contado / crédito / cashea, donde por defecto NO se emite.
   */
  generateInvoice?: boolean;
  /** N° de factura como entero. El N° de control lo deriva el BE. */
  invoiceNumber?: number;
  /** `YYYY-MM-DD`. Sin enviar, el BE usa la fecha de la orden. */
  invoiceDate?: string;
  /** ¿Imprime la fila "Tasa de cambio BCV"? Sin enviar, la regla derivada. */
  showExchangeRate?: boolean;
  /**
   * Órdenes ADICIONALES que cubre esta misma factura (factura agrupada). Sólo
   * aplica cuando la finalización emite factura.
   */
  coveredOrderIds?: string[];
}

export interface OrderServiceTypeRowInput {
  serviceTypeId: string;
  providerType: ProviderType;
  /**
   * Especialidad de esta fila (obligatoria). Una orden puede combinar
   * especialidades; el backend deriva `orders.specialtyId` (principal) de la
   * primera fila.
   */
  specialtyId: string;
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
  /**
   * Número de orden manual (órdenes viejas que se registran ahora). Debe ser
   * cualquier entero libre (el backend valida el bloque completo)
   * y requiere el permiso `orders.custom-number`. Sin él, numeración automática.
   */
  customOrderNumber?: number;
  serviceTypes: OrderServiceTypeRowInput[];
  pathologyIds?: string[];
  orderDate: string;
  appointmentDate: string;
  priceAmount: number;
  /**
   * Motivo del ajuste de monto. Obligatorio cuando `priceAmount` difiere de la
   * suma de precios de catálogo (el BE la recalcula y rechaza el ajuste sin
   * motivo).
   */
  priceAdjustmentNote?: string;
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
  draft: 'Orden creada',
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
 * Orden de presentación de los tipos de orden en la UI (Paso 1 y filtros):
 * Seguro primero (es el tipo por defecto), luego Cashea, Contado y Crédito.
 */
export const ORDER_TYPE_ORDER: OrderType[] = [
  'insurance',
  'cashea',
  'cash',
  'credit',
];

/**
 * Valor de "Clave de Servicio" para la orden interna (Paso 2). Las órdenes de
 * crédito marcadas como reembolso muestran "R"; el resto usa `serviceKey`
 * (que sólo persisten las órdenes de seguro). Vacío si no aplica.
 */
/**
 * Fecha a mostrar en la factura: la capturada en el Paso 4, y si no hay, la
 * fecha de la orden (Paso 1). Devuelve `YYYY-MM-DD`.
 */
export function orderInvoiceDate(order: {
  invoiceDate?: string | null;
  orderDate: string;
}): string {
  const d = (order.invoiceDate ?? '').slice(0, 10);
  return d || order.orderDate;
}

/**
 * ¿La factura imprime la fila "Tasa de cambio BCV"?
 *
 *  - Elección explícita del switch del Paso 4 (sólo órdenes de seguro): manda.
 *  - Sin elección (`null`, y todas las facturas históricas): regla derivada —
 *    se imprime salvo en órdenes con tasa fija (`useFixedRate`, seguro "no
 *    indexado"), donde la cuenta por cobrar ya quedó fija en bolívares.
 *
 * Es la ÚNICA fuente de esta decisión: la usan `orderExcel` y `orderPdf`.
 */
export function invoiceShowsExchangeRate(order: {
  invoiceShowExchangeRate?: boolean | null;
  useFixedRate?: boolean | null;
}): boolean {
  return order.invoiceShowExchangeRate ?? !order.useFixedRate;
}

/**
 * Respuesta de `GET /orders/numbers/availability`. `count` = proveedores
 * distintos de la orden (cada uno consume un número consecutivo, su orden
 * interna del Paso 2), así que la disponibilidad es del BLOQUE
 * `[number, number + count - 1]`.
 */
export interface OrderNumberAvailability {
  count: number;
  /** Número por defecto del Paso 1: el mayor en uso + 1. */
  suggestion: number;
  number: number | null;
  /** `null` cuando no se consultó un número concreto. */
  available: boolean | null;
  /** Números del bloque ya ocupados por órdenes vivas. */
  taken: number[];
  /**
   * Números del bloque libres porque su orden fue CANCELADA: se pueden
   * reutilizar, pero esa orden los sigue mostrando (se avisa en el Paso 1).
   */
  cancelled: number[];
  /** Primer número ≥ el pedido cuyo bloque completo está libre. */
  nextFree: number;
}

/** Disponibilidad de una clave de servicio (Paso 1, órdenes de seguro). */
export interface ServiceKeyAvailability {
  key: string | null;
  /** `null` cuando no se consultó ninguna clave. */
  available: boolean | null;
  /** N° de la orden que la tiene (viva o cancelada). */
  usedByOrderNumber: string | null;
  /** La clave está libre porque la orden que la tenía fue cancelada. */
  cancelled: boolean;
}

/** Orden cancelada: fuera del flujo (no se atiende, informa ni factura). */
export function isOrderCancelled(order: Pick<Order, 'status'>): boolean {
  return order.status === 'cancelled';
}

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

// ----- Historial de cambios por usuario -----

export type OrderChangeAction =
  | 'create'
  | 'update'
  | 'authorize_amount'
  | 'attend'
  | 'report'
  | 'billing'
  | 'provider_amounts'
  | 'payment_add'
  | 'payment_update'
  | 'payment_remove'
  | 'soft_delete'
  | 'restore'
  | 'cancel'
  | 'uncancel'
  | 'invoice_issue'
  | 'invoice_cancel';

/** Fila del historial de cambios de la orden (mapea OrderChangeLog del BE). */
export interface OrderChangeLog {
  id: string;
  orderId: string;
  userId: string;
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  action: OrderChangeAction;
  /** Detalle por campo `{ campo: { from, to } }`. Null si la acción no lleva diff. */
  changes?: Record<string, { from?: unknown; to?: unknown }> | null;
  createdAt: string;
}

export const ORDER_LOG_ACTION_LABEL: Record<OrderChangeAction, string> = {
  create: 'Creación de la orden',
  update: 'Edición del Paso 1',
  authorize_amount: 'Autorización de monto',
  attend: 'Atención del paciente',
  report: 'Informe médico y estudios',
  billing: 'Facturación y liquidación',
  provider_amounts: 'Montos a proveedor corregidos',
  payment_add: 'Pago agregado',
  payment_update: 'Pago modificado',
  payment_remove: 'Pago eliminado',
  soft_delete: 'Movida a la papelera',
  restore: 'Restaurada',
  cancel: 'Orden cancelada',
  uncancel: 'Cancelación revertida',
  invoice_issue: 'Factura emitida',
  invoice_cancel: 'Factura anulada',
};

export const ORDER_LOG_FIELD_LABEL: Record<string, string> = {
  branchId: 'Sucursal',
  type: 'Tipo de orden',
  holderId: 'Titular',
  patientId: 'Paciente',
  contractorId: 'Contratista',
  insuranceId: 'Seguro',
  insuranceSource: 'Origen del seguro',
  serviceKey: 'Clave de servicio',
  isReimbursement: 'Reembolso',
  specialtyId: 'Especialidad',
  orderDate: 'Fecha de orden',
  appointmentDate: 'Fecha de atención',
  priceAmount: 'Monto',
  priceBaseAmount: 'Monto base (catálogo)',
  priceAdjustmentNote: 'Motivo del ajuste de monto',
  orderNumber: 'Número de orden',
  casheaFirstInstallmentAmount: 'Inicial Cashea',
  useFixedRate: 'Tasa fija',
  fixedExchangeRateId: 'Tasa de la orden',
  serviceTypes: 'Tipos de servicio',
  pathologies: 'Patologías',
  payments: 'Pagos',
  attended: 'Atendido',
  status: 'Estado',
  cancelReason: 'Motivo de la cancelación',
  doctorAmount: 'Monto a proveedores',
  invoiceNumber: 'N° de factura',
  controlNumber: 'N° de control',
  invoiceDate: 'Fecha de factura',
  invoiceExchangeRateId: 'Tasa de la factura',
  payment: 'Pago',
};

/** Campos cuyo valor es un ID interno: se muestran como "modificado" sin valores. */
export const ORDER_LOG_ID_FIELDS = new Set<string>([
  'branchId',
  'holderId',
  'patientId',
  'contractorId',
  'insuranceId',
  'specialtyId',
  'fixedExchangeRateId',
  'invoiceExchangeRateId',
]);

/** Nombre visible de un usuario del sistema (creador de la orden, autor del cambio). */
export function orderUserDisplayName(
  u?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null,
): string {
  if (!u) return '—';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email || '—';
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
