export interface RoleSummary {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  deletedAt?: string | null;
  isSystem?: boolean;
}

export interface BranchSummary {
  id: string;
  name: string;
  isActive?: boolean;
  deletedAt?: string | null;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string | null;
  academicDegree?: string | null;
  jobTitle?: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  roles: RoleSummary[];
  branches?: BranchSummary[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  academicDegree?: string;
  jobTitle?: string;
  password: string;
  confirmPassword: string;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  roleIds?: string[];
  branchIds?: string[];
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string | null;
  academicDegree?: string | null;
  jobTitle?: string | null;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  roleIds?: string[];
  branchIds?: string[];
}

export interface ChangePasswordDto {
  currentPassword?: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface UsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  roleId?: string;
  roleIds?: string[];
  branchId?: string;
  sortBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    lastPage: number;
  };
}

export function fullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
