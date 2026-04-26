import { create } from 'zustand';
import type { AuthUser } from '../models/authUser';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null }),
}));

export function selectHasPermission(permission: string) {
  return (state: AuthState): boolean => {
    if (!state.user) return false;
    if (state.user.isSuperAdmin) return true;
    return state.user.permissions.includes(permission);
  };
}
