import { api, getHttpErrorMessage } from '@/lib/api';
import type {
  ChangePasswordDto,
  CreateUserDto,
  PaginatedResponse,
  UpdateUserDto,
  User,
  UsersQuery,
} from '../domain/models/user';

function rethrow(error: unknown): never {
  throw new Error(getHttpErrorMessage(error));
}

function buildParams(query: UsersQuery = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.page) out.page = String(query.page);
  if (query.limit) out.limit = String(query.limit);
  if (query.search) out.search = query.search;
  if (typeof query.isActive === 'boolean') out.isActive = String(query.isActive);
  if (typeof query.isSuperAdmin === 'boolean') out.isSuperAdmin = String(query.isSuperAdmin);
  if (query.roleId) out.roleId = query.roleId;
  if (query.roleIds && query.roleIds.length) out.roleIds = query.roleIds.join(',');
  if (query.sortBy) out.sortBy = query.sortBy;
  if (query.sortDir) out.sortDir = query.sortDir;
  if (query.withDeleted) out.withDeleted = 'true';
  return out;
}

export const userGateway = {
  list: async (query: UsersQuery = {}): Promise<PaginatedResponse<User>> => {
    try {
      const { data } = await api.get<PaginatedResponse<User>>('/users', {
        params: buildParams(query),
      });
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  getById: async (id: string): Promise<User> => {
    try {
      const { data } = await api.get<User>(`/users/${id}`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  create: async (dto: CreateUserDto): Promise<User> => {
    try {
      const { data } = await api.post<User>('/users', dto);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  update: async (id: string, dto: UpdateUserDto): Promise<User> => {
    try {
      const { data } = await api.patch<User>(`/users/${id}`, dto);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  changePassword: async (id: string, dto: ChangePasswordDto): Promise<void> => {
    try {
      await api.patch(`/users/${id}/change-password`, dto);
    } catch (e) {
      return rethrow(e);
    }
  },
  toggleActive: async (id: string): Promise<User> => {
    try {
      const { data } = await api.patch<User>(`/users/${id}/toggle-active`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
  softDelete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/users/${id}`);
    } catch (e) {
      return rethrow(e);
    }
  },
  hardDelete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/users/${id}/permanent`);
    } catch (e) {
      return rethrow(e);
    }
  },
  restore: async (id: string): Promise<User> => {
    try {
      const { data } = await api.patch<User>(`/users/${id}/restore`);
      return data;
    } catch (e) {
      return rethrow(e);
    }
  },
};
