import type { Insurance } from '@/modules/insurances/domain/models/insurance';

export interface Contractor {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  insurances?: Insurance[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateContractorDto {
  name: string;
  description?: string;
  isActive?: boolean;
  insuranceIds?: string[];
}

export interface UpdateContractorDto {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  insuranceIds?: string[];
}

export interface ContractorsQuery {
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
