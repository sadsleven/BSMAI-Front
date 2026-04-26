import { api, getHttpErrorMessage } from '@/lib/api';
import type {
  AssignPermissionsDto,
  CreateRoleDto,
  PaginatedResponse,
  Permission,
  Role,
  RolesQuery,
  UpdateRoleDto,
} from '../domain/models/role';

function rethrow(error: unknown): never {
  throw new Error(getHttpErrorMessage(error));
}

function buildParams(query: RolesQuery = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.page) out.page = String(query.page);
  if (query.limit) out.limit = String(query.limit);
  if (query.search) out.search = query.search;
  if (query.sortBy) out.sortBy = query.sortBy;
  if (query.sortDir) out.sortDir = query.sortDir;
  if (query.withDeleted) out.withDeleted = 'true';
  if (query.origin && query.origin !== 'all') out.origin = query.origin;
  if (typeof query.isActive === 'boolean') out.isActive = String(query.isActive);
  return out;
}

export const roleGateway = {
  list: async (query: RolesQuery = {}): Promise<PaginatedResponse<Role>> => {
    try {
      const { data } = await api.get<PaginatedResponse<Role>>('/roles', {
        params: buildParams(query),
      });
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  listAll: async (): Promise<Role[]> => {
    try {
      const { data } = await api.get<PaginatedResponse<Role>>('/roles', {
        params: { page: 1, limit: 100 },
      });
      return data.data;
    } catch (e) {
      return rethrow(e);
    }
  },
  listAssignable: async (): Promise<Role[]> => {
    try {
      const { data } = await api.get<Role[]>('/roles/assignable');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return rethrow(e);
    }
  },
  toggleActive: async (id: string): Promise<Role> => {
    try {
      const { data } = await api.patch<Role>(`/roles/${id}/toggle-active`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  getById: async (id: string): Promise<Role> => {
    try {
      const { data } = await api.get<Role>(`/roles/${id}`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  create: async (dto: CreateRoleDto): Promise<Role> => {
    try {
      const { data } = await api.post<Role>('/roles', dto);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  update: async (id: string, dto: UpdateRoleDto): Promise<Role> => {
    try {
      const { data } = await api.patch<Role>(`/roles/${id}`, dto);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  assignPermissions: async (id: string, dto: AssignPermissionsDto): Promise<Role> => {
    try {
      const { data } = await api.patch<Role>(`/roles/${id}/permissions`, dto);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  softDelete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/roles/${id}`);
    } catch (e) {
      return rethrow(e);
    }
  },
  hardDelete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/roles/${id}/permanent`);
    } catch (e) {
      return rethrow(e);
    }
  },
  restore: async (id: string): Promise<Role> => {
    try {
      const { data } = await api.patch<Role>(`/roles/${id}/restore`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
};

export const permissionGateway = {
  list: async (): Promise<Permission[]> => {
    try {
      const { data } = await api.get<Permission[]>('/permissions');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return rethrow(e);
    }
  },
};
