export interface CasheaCommissionConfig {
  /** Fracción 0..0.5 sobre el TOTAL de la venta (comisión). Ej. 0.0464 = 4.64%. */
  commissionRate: number;
  /** Fracción 0..0.5 sobre el RESTANTE (total − inicial) — financiamiento. Ej. 0.062 = 6.2%. */
  financingRate: number;
}

export interface UpdateCasheaCommissionInput {
  commissionRate: number;
  financingRate: number;
}
