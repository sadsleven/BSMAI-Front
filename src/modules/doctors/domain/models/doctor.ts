import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type { ServicePriceRow, ServicePricePayload } from '@/lib/types/servicePrice';

export type PaymentMethodType = 'mobile_payment' | 'bank_transfer' | 'other';

export interface DoctorPhone {
  id?: string;
  number: string;
  label?: string | null;
}

export interface DoctorPaymentMethod {
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

export interface Doctor {
  id: string;
  cedula: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  isLegalEntity: boolean;
  rif?: string | null;
  isActive: boolean;
  specialties: Specialty[];
  phones: DoctorPhone[];
  paymentMethods: DoctorPaymentMethod[];
  /** Precios de pago al doctor por Tipo de Servicio realizado. */
  servicePrices?: ServicePriceRow[];
  /** Cuenta de usuario vinculada (acceso al sistema). Null si no tiene acceso. */
  userId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateDoctorDto {
  cedula: string;
  email: string;
  firstName: string;
  lastName: string;
  isLegalEntity?: boolean;
  rif?: string;
  phones: { number: string; label?: string }[];
  specialtyIds: string[];
  paymentMethods?: DoctorPaymentMethod[];
  servicePrices?: ServicePricePayload[];
  isActive?: boolean;
  /** Si se define, habilita/cambia el acceso del doctor como usuario proveedor. */
  password?: string;
}

export type UpdateDoctorDto = Partial<CreateDoctorDto>;

export interface DoctorsQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'firstName' | 'lastName' | 'cedula' | 'email' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
  entityType?: 'natural' | 'legal' | 'all';
  specialtyId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export function fullName(d: Pick<Doctor, 'firstName' | 'lastName'>): string {
  return `${d.firstName} ${d.lastName}`.trim();
}
