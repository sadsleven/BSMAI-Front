export interface CasheaCommissionConfig {
  /** Fracción 0..0.5. Ej. 0.10 = 10%. */
  commissionRate: number;
}

export interface UpdateCasheaCommissionInput {
  commissionRate: number;
}
