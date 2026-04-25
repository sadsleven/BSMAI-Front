import { api, getHttpErrorMessage } from '@/lib/api';
import type { User, CreateUserDto, UpdateUserDto } from '../domain/models/user';

function extractList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (Array.isArray(inner)) {
      return inner as T[];
    }
  }
  if (payload && typeof payload === 'object' && 'items' in payload) {
    const inner = (payload as { items: unknown }).items;
    if (Array.isArray(inner)) {
      return inner as T[];
    }
  }
  return [];
}

function extractOne<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function rethrowAsMessage(error: unknown): never {
  throw new Error(getHttpErrorMessage(error));
}

export const userGateway = {
  getAll: async (): Promise<User[]> => {
    try {
      const { data } = await api.get<unknown>('/users');
      return extractList<User>(data);
    } catch (e) {
      return rethrowAsMessage(e);
    }
  },

  getById: async (id: string): Promise<User | null> => {
    try {
      const { data } = await api.get<unknown>(`/users/${id}`);
      return extractOne<User>(data);
    } catch (e) {
      return rethrowAsMessage(e);
    }
  },

  create: async (user: CreateUserDto): Promise<User> => {
    try {
      const { data } = await api.post<unknown>('/users', user);
      return extractOne<User>(data);
    } catch (e) {
      return rethrowAsMessage(e);
    }
  },

  update: async (id: string, user: UpdateUserDto): Promise<User> => {
    try {
      const { data } = await api.patch<unknown>(`/users/${id}`, user);
      return extractOne<User>(data);
    } catch (e) {
      return rethrowAsMessage(e);
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/users/${id}`);
    } catch (e) {
      return rethrowAsMessage(e);
    }
  },
};
