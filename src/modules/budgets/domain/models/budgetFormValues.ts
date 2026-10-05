import type { BudgetValues } from '@/lib/validations/schemas';
import { localTodayIso } from '@/lib/dates';
import type { Budget, CreateBudgetDto } from './budget';

/** Formulario en blanco. Lo comparten crear y editar (que lo sobreescribe). */
export const BUDGET_DEFAULT_VALUES: BudgetValues = {
  branchId: '',
  // Lo habitual es presupuestar contra un seguro.
  type: 'insurance',
  holderId: '',
  patientId: '',
  insuranceId: '',
  insuranceSource: '',
  contractorId: '',
  serviceTypes: [],
  pathologyIds: [],
  diagnosisNote: '',
  observations: '',
  referringDoctorName: '',
  referringSpecialtyName: '',
  budgetDate: localTodayIso(),
  validUntilDate: '',
  priceAmount: 0,
  priceAdjustmentNote: '',
  exchangeRateId: '',
  paymentAccountId: '',
};

/**
 * Valores del formulario → DTO del backend. Los campos de seguro se descartan
 * en un presupuesto particular aunque hayan quedado en el formulario tras un
 * cambio de tipo: el BE los rechaza y no deben viajar.
 */
export function buildBudgetDto(values: BudgetValues): CreateBudgetDto {
  const isInsurance = values.type === 'insurance';
  return {
    branchId: values.branchId,
    type: values.type,
    holderId: values.holderId,
    patientId: values.patientId,
    insuranceId: isInsurance ? values.insuranceId || undefined : undefined,
    insuranceSource: isInsurance
      ? ((values.insuranceSource || undefined) as
          | 'direct'
          | 'via_contractor'
          | undefined)
      : undefined,
    contractorId: isInsurance ? values.contractorId || undefined : undefined,
    serviceTypes: (values.serviceTypes ?? []).map((r) => ({
      serviceTypeId: r.serviceTypeId,
      specialtyId: r.specialtyId || undefined,
      customName: (r.customName ?? '').trim(),
      quantity: r.quantity ?? undefined,
      unitPriceUsd: r.unitPriceUsd,
      catalogPriceUsd: r.catalogPriceUsd ?? undefined,
      providerType: (r.providerType || undefined) as
        | 'doctor'
        | 'care_center'
        | undefined,
      doctorId: r.providerType === 'doctor' ? r.doctorId || undefined : undefined,
      careCenterId:
        r.providerType === 'care_center' ? r.careCenterId || undefined : undefined,
    })),
    pathologyIds: values.pathologyIds ?? [],
    diagnosisNote: values.diagnosisNote?.trim() || undefined,
    observations: values.observations?.trim() || undefined,
    referringDoctorName: values.referringDoctorName?.trim() || undefined,
    referringSpecialtyName: values.referringSpecialtyName?.trim() || undefined,
    budgetDate: values.budgetDate,
    validUntilDate: values.validUntilDate || undefined,
    priceAmount: values.priceAmount,
    // Motivo del ajuste: sólo cuando el monto difiere del base de catálogo (el
    // BE recalcula el base y vuelve a exigirlo si hay diferencia).
    priceAdjustmentNote:
      typeof values.priceBaseAmount === 'number' &&
      Math.round(values.priceBaseAmount * 100) !==
        Math.round(values.priceAmount * 100)
        ? (values.priceAdjustmentNote ?? '').trim()
        : undefined,
    exchangeRateId: values.exchangeRateId || undefined,
    paymentAccountId: isInsurance
      ? values.paymentAccountId || undefined
      : undefined,
  };
}

/** Presupuesto del backend → valores del formulario (modo edición). */
export function budgetToFormValues(budget: Budget): BudgetValues {
  const rows = [...(budget.budgetServiceTypes ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return {
    ...BUDGET_DEFAULT_VALUES,
    branchId: budget.branchId,
    type: budget.type,
    holderId: budget.holderId,
    patientId: budget.patientId,
    insuranceId: budget.insuranceId ?? '',
    insuranceSource: budget.insuranceSource ?? '',
    contractorId: budget.contractorId ?? '',
    serviceTypes: rows.map((r) => ({
      serviceTypeId: r.serviceTypeId,
      specialtyId: r.specialtyId ?? '',
      customName: r.customName,
      quantity: r.quantity,
      unitPriceUsd: Number(r.unitPriceUsd) || 0,
      catalogPriceUsd:
        r.catalogPriceUsd != null ? Number(r.catalogPriceUsd) : undefined,
      providerType: r.providerType ?? '',
      doctorId: r.doctorId ?? '',
      careCenterId: r.careCenterId ?? '',
    })),
    pathologyIds: (budget.pathologies ?? []).map((p) => p.id),
    diagnosisNote: budget.diagnosisNote ?? '',
    observations: budget.observations ?? '',
    referringDoctorName: budget.referringDoctorName ?? '',
    referringSpecialtyName: budget.referringSpecialtyName ?? '',
    budgetDate: budget.budgetDate.slice(0, 10),
    validUntilDate: budget.validUntilDate?.slice(0, 10) ?? '',
    priceAmount: Number(budget.priceAmount) || 0,
    priceBaseAmount:
      budget.priceBaseAmount != null ? Number(budget.priceBaseAmount) : undefined,
    priceAdjustmentNote: budget.priceAdjustmentNote ?? '',
    exchangeRateId: budget.exchangeRateId ?? '',
    paymentAccountId: budget.paymentAccountId ?? '',
  };
}
