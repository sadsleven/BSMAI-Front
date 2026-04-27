import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type {
  PaymentMethodType,
} from '@/modules/doctors/domain/models/doctor';

export interface CareCenterPhone {
  id?: string;
  number: string;
  label?: string | null;
}

export interface CareCenterPaymentMethod {
  id?: string;
  type: PaymentMethodType;
  isActive?: boolean;
  bankCode?: string | null;
  phoneNumber?: string | null;
  idDocument?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  description?: string | null;
}

export interface CareCenter {
  id: string;
  name: string;
  email: string;
  rif: string;
  isActive: boolean;
  specialties: Specialty[];
  phones: CareCenterPhone[];
  paymentMethods: CareCenterPaymentMethod[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateCareCenterDto {
  name: string;
  email: string;
  rif: string;
  phones: { number: string; label?: string }[];
  specialtyIds: string[];
  paymentMethods?: CareCenterPaymentMethod[];
  isActive?: boolean;
}

export type UpdateCareCenterDto = Partial<CreateCareCenterDto>;

export interface CareCentersQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'name' | 'email' | 'rif' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
  specialtyId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
