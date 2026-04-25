import { api } from '@/lib/api';
import { clearAccessToken, setAccessToken } from './tokenStorage';
import type { AuthUser } from '../domain/models/authUser';

function mapUser(data: unknown): AuthUser {
  if (!data || typeof data !== 'object') {
    throw new Error('Respuesta de usuario inválida');
  }
  const o = data as Record<string, unknown>;
  const id = String(o.id ?? o.sub ?? '');
  const email = String(o.email ?? '');
  if (!id || !email) {
    throw new Error('Faltan id o email en el usuario');
  }
  return {
    id,
    email,
    full_name: typeof o.full_name === 'string' ? o.full_name : undefined,
    role: o.role === 'admin' || o.role === 'user' ? o.role : undefined,
  };
}

function pickUserPayload(raw: Record<string, unknown>): unknown {
  if (raw.user !== undefined) {
    return raw.user;
  }
  const rest = { ...raw };
  delete rest.accessToken;
  delete rest.access_token;
  delete rest.token;
  return Object.keys(rest).length ? rest : raw;
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
    try {
      return mapUser(pickUserPayload(data));
    } catch {
      return await fetchMe();
    }
  },

  getMe: fetchMe,

  logout(): void {
    clearAccessToken();
  },
};
