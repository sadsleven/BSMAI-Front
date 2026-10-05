import type { OrderValues } from '@/lib/validations/schemas';
import { localTodayIso } from '@/lib/dates';
import type { Budget } from './budget';

/**
 * Presupuesto aprobado → valores del Paso 1 de la orden.
 *
 * Traslada lo que ya está decidido (titular, paciente, seguro, servicios,
 * monto) y deja al usuario lo que el presupuesto no sabe:
 *  - El **proveedor** de cada fila: la orden lo exige y el presupuesto suele no
 *    tenerlo. Las filas sin proveedor llegan marcadas como "Doctor" sin elegir,
 *    y el formulario las señala hasta que se complete.
 *  - La **fecha de atención**, que no existe hasta que hay cita.
 *  - El **tipo de orden** cuando el presupuesto es particular: podría cobrarse
 *    de contado, a crédito o por Cashea. Se propone Contado.
 *
 * El monto viaja tal cual se presupuestó: si difiere del catálogo, el Paso 1
 * mostrará el ajuste y pedirá su motivo (el del presupuesto se propone).
 */
export function budgetToOrderValues(
  budget: Budget,
  defaults: OrderValues,
): OrderValues {
  const rows = [...(budget.budgetServiceTypes ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const isInsurance = budget.type === 'insurance';
  return {
    ...defaults,
    branchId: budget.branchId,
    type: isInsurance ? 'insurance' : 'cash',
    holderId: budget.holderId,
    patientId: budget.patientId,
    insuranceId: isInsurance ? (budget.insuranceId ?? '') : '',
    insuranceSource: isInsurance ? (budget.insuranceSource ?? '') : '',
    contractorId: isInsurance ? (budget.contractorId ?? '') : '',
    serviceTypes: rows.map((r) => ({
      serviceTypeId: r.serviceTypeId,
      // La orden exige proveedor; sin uno presupuestado se propone Doctor y el
      // buscador queda vacío para que el usuario lo elija.
      providerType: r.providerType ?? 'doctor',
      specialtyId: r.specialtyId ?? '',
      doctorId: r.providerType === 'doctor' ? (r.doctorId ?? '') : '',
      careCenterId:
        r.providerType === 'care_center' ? (r.careCenterId ?? '') : '',
      quantity: r.quantity,
      customName: r.customName,
    })),
    pathologyIds: (budget.pathologies ?? []).map((p) => p.id),
    orderDate: localTodayIso(),
    appointmentDate: '',
    priceAmount: Number(budget.priceAmount) || 0,
    priceAdjustmentNote: budget.priceAdjustmentNote ?? '',
  };
}
