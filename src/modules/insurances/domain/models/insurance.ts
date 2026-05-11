export interface InsurancePhone {
  id?: string;
  number: string;
  label?: string | null;
}

export interface Insurance {
  id: string;
  name: string;
  description?: string | null;
  email?: string | null;
  fiscalAddress?: string | null;
  /** Número/identificador del seguro. Opcional, sin restricción de unicidad. */
  policyNumber?: string | null;
  isActive: boolean;
  phones: InsurancePhone[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateInsuranceDto {
  name: string;
  description?: string;
  email?: string;
  fiscalAddress?: string;
  policyNumber?: string;
  phones: { number: string; label?: string }[];
  isActive?: boolean;
}

export type UpdateInsuranceDto = Partial<CreateInsuranceDto>;

export interface InsurancesQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
