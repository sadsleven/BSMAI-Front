import type { Insurance } from '@/modules/insurances/domain/models/insurance';

/** Precio por (ServiceType, Insurance | Particular). insurance null = Particular. */
export interface ServiceTypePrice {
  id?: string;
  insuranceId?: string | null;
  insurance?: Insurance | null;
  priceUsd?: string | number | null;
  priceEur?: string | number | null;
}

export interface ServiceType {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  prices?: ServiceTypePrice[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ServiceTypePricePayload {
  insuranceId?: string;
  priceUsd?: number;
  priceEur?: number;
}

export interface CreateServiceTypeDto {
  name: string;
  description?: string;
  isActive?: boolean;
  prices?: ServiceTypePricePayload[];
}

export interface UpdateServiceTypeDto {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  prices?: ServiceTypePricePayload[];
}

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
