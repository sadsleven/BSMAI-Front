import type { OrderValues } from '@/lib/validations/schemas';

/**
 * Borrador PARCIAL del Paso 1. `payload` son los valores crudos del formulario
 * (posiblemente incompletos) tal cual se guardaron; se hidratan al reanudar.
 */
export interface OrderDraft {
  id: string;
  branchId?: string | null;
  label?: string | null;
  payload: Partial<OrderValues>;
  createdAt: string;
  updatedAt: string;
}

export interface SaveOrderDraftDto {
  branchId?: string;
  label?: string;
  payload: Partial<OrderValues>;
}
