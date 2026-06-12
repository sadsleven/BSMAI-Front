export interface CasheaCommissionConfig {
  /** Fracción 0..0.5 sobre la primera cuota (inicial). Ej. 0.04 = 4%. */
  firstInstallmentRate: number;
  /** Fracción 0..0.5 sobre el total de la orden. Ej. 0.06 = 6%. */
  totalRate: number;
}

export interface UpdateCasheaCommissionInput {
  firstInstallmentRate: number;
  totalRate: number;
}
