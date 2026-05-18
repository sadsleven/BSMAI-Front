import type { ServicePriceRow, ServicePricePayload } from '@/lib/types/servicePrice';

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
  isActive: boolean;
  phones: InsurancePhone[];
  /** Precios de cobro por Tipo de Servicio que el seguro cubre. */
  servicePrices?: ServicePriceRow[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateInsuranceDto {
  name: string;
  description?: string;
  email?: string;
  fiscalAddress?: string;
  phones: { number: string; label?: string }[];
  servicePrices?: ServicePricePayload[];
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
