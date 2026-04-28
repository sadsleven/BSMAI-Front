import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

export type PersonType = 'natural' | 'legal_entity';
export const PERSON_TYPES: PersonType[] = ['natural', 'legal_entity'];

export interface PatientPhone {
  id?: string;
  number: string;
  label?: string | null;
}

export interface Patient {
  id: string;
  personType: PersonType;
  /** Sólo natural. */
  cedula?: string | null;
  email: string;
  /** Sólo natural. */
  firstName?: string | null;
  /** Sólo natural. */
  lastName?: string | null;
  /** Sólo legal_entity. */
  businessName?: string | null;
  /** Sólo legal_entity. */
  rif?: string | null;
  birthDate: string;
  address: string;
  isActive: boolean;
  phones: PatientPhone[];
  insurances: Insurance[];
  contractors: Contractor[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreatePatientDto {
  personType: PersonType;
  cedula?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  rif?: string;
  birthDate: string;
  address: string;
  phones: { number: string; label?: string }[];
  insuranceIds?: string[];
  contractorIds?: string[];
  isActive?: boolean;
}

export type UpdatePatientDto = Partial<CreatePatientDto>;

export interface PatientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?:
    | 'firstName'
    | 'lastName'
    | 'businessName'
    | 'cedula'
    | 'rif'
    | 'email'
    | 'createdAt'
    | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
  birthDateFrom?: string;
  birthDateTo?: string;
  insuranceId?: string;
  contractorId?: string;
  personType?: PersonType;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

/** Devuelve nombre completo natural o businessName jurídico. */
export function displayName(p: Patient): string {
  if (p.personType === 'legal_entity') return p.businessName ?? '';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
}

/** Identificación visible: cédula natural o RIF jurídico. */
export function displayIdentifier(p: Patient): string {
  return p.personType === 'legal_entity' ? p.rif ?? '' : p.cedula ?? '';
}

/** Iniciales para avatar. */
export function patientInitials(p: Patient): string {
  if (p.personType === 'legal_entity') {
    const bn = p.businessName ?? 'E';
    return bn.slice(0, 2).toUpperCase();
  }
  return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || 'P';
}
