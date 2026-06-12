export interface TaxUnit {
  id: string;
  /** Backend devuelve string para preservar decimales (ej. "43.00"). */
  amountBs: string;
  effectiveDate: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateTaxUnitDto {
  amountBs: number;
  effectiveDate: string;
  isActive?: boolean;
}

export interface UpdateTaxUnitDto {
  amountBs?: number;
  effectiveDate?: string;
  isActive?: boolean;
}

export interface TaxUnitsQuery {
  page?: number;
  limit?: number;
  sortBy?: 'effectiveDate' | 'amountBs' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
