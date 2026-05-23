/**
 * Tipo de Servicio. Sólo guarda el precio "Particular" (USD y EUR) — los precios
 * por Seguro, Doctor o Centro viven en sus propias sub-tablas.
 */
export interface ServiceType {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  particularPriceUsd: string | number;
  particularPriceEur: string | number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateServiceTypeDto {
  name: string;
  description?: string;
  isActive?: boolean;
  particularPriceUsd: number;
  particularPriceEur: number;
}

export type UpdateServiceTypeDto = Partial<CreateServiceTypeDto>;

export interface ServiceTypesQuery {
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
