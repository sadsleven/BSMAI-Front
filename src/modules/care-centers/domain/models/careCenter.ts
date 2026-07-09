import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type {
  PaymentMethodType,
} from '@/modules/doctors/domain/models/doctor';
import type { ServicePriceRow, ServicePricePayload } from '@/lib/types/servicePrice';

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
  businessName: string;
  email?: string | null;
  rif?: string | null;
  /** Dirección del centro de atención. Opcional. */
  centerAddress?: string | null;
  isActive: boolean;
  specialties: Specialty[];
  phones: CareCenterPhone[];
  paymentMethods: CareCenterPaymentMethod[];
  /** Precios de pago al centro por Tipo de Servicio realizado. */
  servicePrices?: ServicePriceRow[];
  /** Cuenta de usuario vinculada (acceso al sistema). Null si no tiene acceso. */
  userId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateCareCenterDto {
  businessName: string;
  /** Opcional; requerido solo para habilitar acceso (password). `''` en update → null. */
  email?: string;
  rif?: string;
  centerAddress?: string;
  phones: { number: string; label?: string }[];
  specialtyIds: string[];
  paymentMethods?: CareCenterPaymentMethod[];
  servicePrices?: ServicePricePayload[];
  isActive?: boolean;
  /** Si se define, habilita/cambia el acceso del centro como usuario proveedor. */
  password?: string;
}

export type UpdateCareCenterDto = Partial<CreateCareCenterDto>;

export interface CareCentersQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'businessName' | 'email' | 'rif' | 'createdAt' | 'updatedAt';
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
