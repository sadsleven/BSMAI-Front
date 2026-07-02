/**
 * Tipo de Servicio. Guarda el precio "Particular" en USD (opcional) — los precios
 * por Seguro, Doctor o Centro viven en sus propias sub-tablas.
 */
export interface InsurancePriceAssignment {
  insuranceId: string;
  insuranceName: string;
  priceUsd: string | number;
}
export interface DoctorPriceAssignment {
  doctorId: string;
  doctorName: string;
  priceUsd: string | number;
}
export interface CareCenterPriceAssignment {
  careCenterId: string;
  careCenterName: string;
  priceUsd: string | number;
}

export interface ServiceType {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  particularPriceUsd: string | number | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  /** Asignaciones de precio (sólo en el detalle `getById`). */
  insurancePrices?: InsurancePriceAssignment[];
  doctorPrices?: DoctorPriceAssignment[];
  careCenterPrices?: CareCenterPriceAssignment[];
}

export interface CreateServiceTypeDto {
  name: string;
  description?: string;
  isActive?: boolean;
  particularPriceUsd?: number;
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
