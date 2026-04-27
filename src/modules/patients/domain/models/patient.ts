export interface PatientPhone {
  id?: string;
  number: string;
  label?: string | null;
}

export interface Patient {
  id: string;
  cedula: string;
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  address: string;
  isActive: boolean;
  phones: PatientPhone[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreatePatientDto {
  cedula: string;
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  address: string;
  phones: { number: string; label?: string }[];
  isActive?: boolean;
}

export type UpdatePatientDto = Partial<CreatePatientDto>;

export interface PatientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'firstName' | 'lastName' | 'cedula' | 'email' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
  birthDateFrom?: string;
  birthDateTo?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export function fullName(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim();
}
