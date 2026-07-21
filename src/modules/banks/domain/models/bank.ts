export interface Bank {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBankDto {
  code: string;
  name: string;
  isActive?: boolean;
}

export type UpdateBankDto = Partial<CreateBankDto>;

/**
 * Opciones para selects de banco: sólo habilitados, más el banco actualmente
 * seleccionado aunque esté deshabilitado (o ya no exista en el catálogo),
 * para no perder el valor al editar registros viejos.
 */
export function selectableBanks(banks: Bank[], currentCode?: string | null): Bank[] {
  const active = banks.filter((b) => b.isActive !== false);
  if (!currentCode || active.some((b) => b.code === currentCode)) return active;
  const stale = banks.find((b) => b.code === currentCode);
  return [
    ...active,
    stale ?? { id: currentCode, code: currentCode, name: currentCode, isActive: false },
  ];
}
