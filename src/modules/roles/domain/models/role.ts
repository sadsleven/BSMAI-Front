export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  label?: string | null;
  group?: string | null;
  description?: string | null;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
  permissions: Permission[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: string[];
}

export type UpdateRoleDto = Partial<CreateRoleDto>;

export interface AssignPermissionsDto {
  permissionIds: string[];
}

export interface RolesQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  origin?: 'system' | 'custom' | 'all';
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
