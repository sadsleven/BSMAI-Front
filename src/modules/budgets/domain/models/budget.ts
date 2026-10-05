import type {
  InsuranceSource,
  OrderRefSummary,
  ProviderType,
} from '@/modules/orders/domain/models/order';

export type { OrderRefSummary, ProviderType, InsuranceSource };

export type BudgetStatus = 'draft' | 'sent' | 'approved' | 'rejected';

/**
 * De dónde sale el precio de catálogo de cada servicio, igual que el Paso 1:
 * `particular` → `particularPriceUsd`; `insurance` → baremo del seguro.
 */
export type BudgetType = 'particular' | 'insurance';

/** Plantillas de exportación. Cada una imprime el mismo presupuesto distinto. */
export type BudgetTemplate = 'patient' | 'insurance' | 'aps';

export const BUDGET_TYPE_LABEL: Record<BudgetType, string> = {
  particular: 'Particular',
  insurance: 'Seguro',
};

export const BUDGET_TYPE_ORDER: BudgetType[] = ['insurance', 'particular'];

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export const BUDGET_STATUS_ORDER: BudgetStatus[] = [
  'draft',
  'sent',
  'approved',
  'rejected',
];

export const BUDGET_TEMPLATE_LABEL: Record<BudgetTemplate, string> = {
  patient: 'Paciente (Bs)',
  insurance: 'Seguro ($)',
  aps: 'Solicitud APS',
};

/** Línea de servicio presupuestada (mapea `BudgetServiceType` del BE). */
export interface BudgetServiceTypeRow {
  id?: string;
  serviceTypeId: string;
  serviceType?: { id: string; name: string };
  specialtyId?: string | null;
  specialty?: { id: string; name: string } | null;
  /** Nombre con el que el servicio sale impreso. */
  customName: string;
  quantity: number;
  /** Precio unitario USD cotizado (snapshot editable). */
  unitPriceUsd: string | number;
  /** Precio de catálogo al guardar. Null = el catálogo no tenía precio. */
  catalogPriceUsd?: string | number | null;
  providerType?: ProviderType | null;
  doctorId?: string | null;
  doctor?: (OrderRefSummary & { centerAddress?: string | null }) | null;
  careCenterId?: string | null;
  careCenter?: (OrderRefSummary & { centerAddress?: string | null }) | null;
  position?: number;
}

export interface Budget {
  id: string;
  /** Correlativo impreso (`P-00123`). */
  budgetNumber: string;
  number: string;
  branchId: string;
  branch?: { id: string; name: string };
  type: BudgetType;
  status: BudgetStatus;
  holderId: string;
  holder?: OrderRefSummary;
  patientId: string;
  patient?: OrderRefSummary;
  insuranceId?: string | null;
  insurance?: {
    id: string;
    name: string;
    shortName?: string | null;
    rif?: string | null;
    fiscalAddress?: string | null;
    phones?: Array<{ id?: string; number: string; label?: string | null }>;
  } | null;
  insuranceSource?: InsuranceSource | null;
  contractorId?: string | null;
  contractor?: { id: string; name: string } | null;
  specialtyId?: string | null;
  specialty?: { id: string; name: string } | null;
  budgetServiceTypes?: BudgetServiceTypeRow[];
  pathologies?: Array<{ id: string; name: string }>;
  /** Diagnóstico redactado; si está, sustituye a las patologías al imprimir. */
  diagnosisNote?: string | null;
  observations?: string | null;
  referringDoctorName?: string | null;
  referringSpecialtyName?: string | null;
  budgetDate: string;
  validUntilDate?: string | null;
  priceAmount: string | number;
  priceBaseAmount?: string | number | null;
  priceAdjustmentNote?: string | null;
  exchangeRateId?: string | null;
  exchangeRate?: {
    id: string;
    currency: 'USD' | 'EUR';
    amountBs: string | number;
    effectiveDate?: string;
  } | null;
  paymentAccountId?: string | null;
  paymentAccount?: {
    id: string;
    name: string;
    type: string;
    bankCode?: string | null;
    accountNumber?: string | null;
    accountHolderName?: string | null;
    idDocument?: string | null;
  } | null;
  sentAt?: string | null;
  decidedAt?: string | null;
  rejectReason?: string | null;
  convertedOrderId?: string | null;
  convertedOrder?: { id: string; orderNumber: string } | null;
  convertedAt?: string | null;
  createdById: string;
  createdBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    academicDegree?: string | null;
    jobTitle?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** Derivado en el BE: vigencia pasada y todavía sin decidir. */
  expired?: boolean;
}

export interface BudgetServiceTypeInput {
  serviceTypeId: string;
  specialtyId?: string;
  customName: string;
  quantity?: number;
  unitPriceUsd: number;
  catalogPriceUsd?: number;
  providerType?: ProviderType;
  doctorId?: string;
  careCenterId?: string;
}

export interface CreateBudgetDto {
  branchId: string;
  type: BudgetType;
  holderId: string;
  patientId: string;
  insuranceId?: string;
  insuranceSource?: InsuranceSource;
  contractorId?: string;
  serviceTypes: BudgetServiceTypeInput[];
  pathologyIds?: string[];
  diagnosisNote?: string;
  observations?: string;
  referringDoctorName?: string;
  referringSpecialtyName?: string;
  budgetDate: string;
  validUntilDate?: string;
  priceAmount: number;
  priceAdjustmentNote?: string;
  exchangeRateId?: string;
  paymentAccountId?: string;
}

export type UpdateBudgetDto = Partial<CreateBudgetDto>;

export interface ChangeBudgetStatusDto {
  status: BudgetStatus;
  rejectReason?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export interface BudgetsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: BudgetStatus;
  type?: BudgetType;
  branchId?: string;
  insuranceId?: string;
  patientId?: string;
  budgetDateFrom?: string;
  budgetDateTo?: string;
  expired?: boolean;
  converted?: boolean;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
}

/** Total cotizado de una línea: precio unitario × cantidad. */
export function budgetRowTotalUsd(row: BudgetServiceTypeRow): number {
  const unit = Number(row.unitPriceUsd) || 0;
  const qty = Math.max(1, Math.trunc(row.quantity ?? 1));
  return +(unit * qty).toFixed(2);
}

/** Suma de las líneas tal como se cotizaron (sin el ajuste global). */
export function budgetLinesTotalUsd(budget: Budget): number {
  const cents = (budget.budgetServiceTypes ?? []).reduce(
    (acc, r) => acc + Math.round(budgetRowTotalUsd(r) * 100),
    0,
  );
  return cents / 100;
}

/**
 * Ajuste global vigente: diferencia entre el monto presupuestado y la suma de
 * los precios de catálogo. Null si no hay base comparable o no hay diferencia.
 */
export function budgetAdjustment(
  budget: Budget,
): { amount: number; percent: number | null; isDiscount: boolean } | null {
  if (budget.priceBaseAmount == null) return null;
  const baseCents = Math.round(Number(budget.priceBaseAmount) * 100);
  const diffCents = Math.round(Number(budget.priceAmount) * 100) - baseCents;
  if (diffCents === 0) return null;
  return {
    amount: diffCents / 100,
    percent: baseCents > 0 ? (diffCents / baseCents) * 100 : null,
    isDiscount: diffCents < 0,
  };
}

/**
 * Diagnóstico impreso: el texto redactado manda; sin él, las patologías del
 * presupuesto unidas por " + " (como viene del médico en el formato de AFMI).
 */
export function budgetDiagnosisText(budget: Budget): string {
  const note = (budget.diagnosisNote ?? '').trim();
  if (note) return note;
  return (budget.pathologies ?? [])
    .map((p) => p.name)
    .filter(Boolean)
    .join(' + ');
}

/**
 * Plantillas que tienen sentido para un presupuesto. La de SEGUROS y la de APS
 * sólo aplican a presupuestos de tipo seguro; la de PACIENTE siempre.
 */
export function budgetTemplatesFor(budget: Budget): BudgetTemplate[] {
  return budget.type === 'insurance'
    ? ['insurance', 'patient', 'aps']
    : ['patient'];
}

/** El presupuesto se puede editar mientras no haya generado su orden. */
export function budgetIsEditable(budget: Budget): boolean {
  return !budget.convertedOrderId && !budget.deletedAt;
}
