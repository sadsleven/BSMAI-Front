import type { AuthBranch, AuthUser } from '@/modules/auth/domain/models/authUser';

/**
 * Sucursales que aplican al usuario actual.
 *
 * Reglas (replicadas del backend en `auth.service.ts#resolveVisibleBranches`):
 * - Super Admin → todas las sucursales activas (BE expande la lista en `/auth/me`).
 * - Regular → asignaciones propias filtradas a activas + no eliminadas.
 *
 * **Único punto** donde un componente debe leer las sucursales del usuario
 * autenticado. Nunca chequear `if (isSuperAdmin)` en otros lados — pasar por aquí.
 */
export function getUserBranches(user: AuthUser | null | undefined): AuthBranch[] {
  if (!user) return [];
  return user.branches ?? [];
}

/** True si el usuario tiene acceso a la sucursal dada (incluye Super Admin → todas). */
export function userHasBranch(
  user: AuthUser | null | undefined,
  branchId: string,
): boolean {
  return getUserBranches(user).some((b) => b.id === branchId);
}

/**
 * Última sucursal usada por el usuario actual, persistida por-usuario en localStorage.
 * Default cuando el usuario tiene varias asignadas y aún no eligió ninguna.
 */
export function getLastBranchId(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`lastBranchId:${userId}`);
}

export function setLastBranchId(userId: string, branchId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`lastBranchId:${userId}`, branchId);
}
