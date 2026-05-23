import { api } from '@/lib/api';
import { clearAccessToken, setAccessToken } from './tokenStorage';
import type { AuthUser } from '../domain/models/authUser';

function mapUser(data: unknown): AuthUser {
  if (!data || typeof data !== 'object') {
    throw new Error('Respuesta de usuario inválida');
  }
  const o = data as Record<string, unknown>;
  const id = String(o.id ?? '');
  const email = String(o.email ?? '');
  if (!id || !email) {
    throw new Error('Faltan id o email en el usuario');
  }
  const rolesRaw = Array.isArray(o.roles) ? (o.roles as Record<string, unknown>[]) : [];
  const roles = rolesRaw
    .map((r) => ({ id: String(r.id ?? ''), name: String(r.name ?? '') }))
    .filter((r) => r.id && r.name);
  const permsRaw = Array.isArray(o.permissions) ? (o.permissions as unknown[]) : [];
  const permissions = permsRaw.map((p) => String(p)).filter(Boolean);
  const branchesRaw = Array.isArray(o.branches) ? (o.branches as Record<string, unknown>[]) : [];
  const branches = branchesRaw
    .map((b) => ({ id: String(b.id ?? ''), name: String(b.name ?? '') }))
    .filter((b) => b.id && b.name);
  return {
    id,
    email,
    firstName: String(o.firstName ?? ''),
    lastName: String(o.lastName ?? ''),
    phoneNumber: typeof o.phoneNumber === 'string' ? o.phoneNumber : null,
    academicDegree: typeof o.academicDegree === 'string' ? o.academicDegree : null,
    jobTitle: typeof o.jobTitle === 'string' ? o.jobTitle : null,
    isActive: Boolean(o.isActive),
    isSuperAdmin: Boolean(o.isSuperAdmin),
    roles,
    permissions,
    branches,
  };
}

async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<unknown>('/auth/me');
  return mapUser(data);
}

export const authApi = {
  async login(credentials: { email: string; password: string }): Promise<AuthUser> {
    const { data } = await api.post<Record<string, unknown>>('/auth/login', credentials);
    const token =
      (data.accessToken as string | undefined) ||
      (data.access_token as string | undefined) ||
      (data.token as string | undefined);
    if (!token) {
      throw new Error('El servidor no devolvió un JWT (accessToken, access_token o token)');
    }
    setAccessToken(token);
    if (data.user && typeof data.user === 'object') {
      try {
        return mapUser(data.user);
      } catch {
        /* fall through */
      }
    }
    return await fetchMe();
  },

  getMe: fetchMe,

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore network errors on logout */
    } finally {
      clearAccessToken();
    }
  },

  async updateMyProfile(payload: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string | null;
    academicDegree?: string | null;
    jobTitle?: string | null;
  }): Promise<AuthUser> {
    const { data } = await api.patch<unknown>('/auth/me', payload);
    return mapUser(data);
  },

  async changeMyPassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Promise<void> {
    await api.patch('/auth/me/password', payload);
  },
};
