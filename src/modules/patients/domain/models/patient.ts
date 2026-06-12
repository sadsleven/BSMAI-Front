import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

/** Une los seguros derivados de contratistas, sin duplicados. */
export function patientInsurancesFromContractors(p: { contractors?: Contractor[] }): Insurance[] {
  const map = new Map<string, Insurance>();
  for (const c of p.contractors ?? []) {
    for (const i of c.insurances ?? []) {
      if (!map.has(i.id)) map.set(i.id, i);
    }
  }
  return Array.from(map.values());
}

export type InsuranceSource = 'direct' | 'via_contractor';

export interface PatientAvailableInsurance {
  insurance: Pick<Insurance, 'id' | 'name'>;
  source: InsuranceSource;
  /** Sólo presente cuando `source === 'via_contractor'`. */
  contractor: { id: string; name: string } | null;
}

/**
 * Unión sin duplicar (por id de seguro) de seguros directos + vía contratistas.
 * Si un seguro aparece por ambos caminos, prevalece el directo.
 */
export function patientAllInsurances(p: {
  contractors?: Contractor[];
  insurances?: Insurance[];
}): Insurance[] {
  const map = new Map<string, Insurance>();
  for (const i of p.insurances ?? []) {
    if (!map.has(i.id)) map.set(i.id, i);
  }
  for (const c of p.contractors ?? []) {
    for (const i of c.insurances ?? []) {
      if (!map.has(i.id)) map.set(i.id, i);
    }
  }
  return Array.from(map.values());
}

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
  email?: string | null;
  /** Sólo natural. */
  firstName?: string | null;
  /** Sólo natural. */
  lastName?: string | null;
  /** Sólo legal_entity. */
  businessName?: string | null;
  /** Sólo legal_entity. */
  rif?: string | null;
  birthDate?: string | null;
  address: string;
  isActive: boolean;
  phones: PatientPhone[];
  contractors: Contractor[];
  /** Seguros directos del paciente (pivot `patient_insurances`). */
  insurances?: Insurance[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreatePatientDto {
  personType: PersonType;
  cedula?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  rif?: string;
  birthDate?: string;
  address: string;
  phones: { number: string; label?: string }[];
  contractorIds?: string[];
  directInsuranceIds?: string[];
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
