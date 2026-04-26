export interface AuthRole {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  roles: AuthRole[];
  permissions: string[];
}

export function getFullName(user: AuthUser | null | undefined): string {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(user: AuthUser | null | undefined, perms: string[]): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return perms.some((p) => user.permissions?.includes(p));
}
