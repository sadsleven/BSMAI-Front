import { useAuthStore } from '@/modules/auth/domain/store/authStore';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const has = (permission: string): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.permissions.includes(permission);
  };
  const hasAny = (perms: string[]): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return perms.some((p) => user.permissions.includes(p));
  };
  return {
    user,
    isSuperAdmin: !!user?.isSuperAdmin,
    has,
    hasAny,
  };
}
