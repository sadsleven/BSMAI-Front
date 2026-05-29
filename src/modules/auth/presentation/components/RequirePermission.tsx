import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';

export type RequirePermissionProps = {
  permission?: string;
  anyOf?: string[];
  /** Where to redirect when denied. Defaults to '/'. */
  redirectTo?: string;
  children: ReactNode;
};

/** Route-level permission guard. Redirects if user lacks the permission. */
export function RequirePermission({
  permission,
  anyOf,
  redirectTo = '/',
  children,
}: RequirePermissionProps) {
  const { has, hasAny } = usePermissions();
  let allowed = true;
  if (permission) allowed = has(permission);
  if (anyOf && anyOf.length > 0) allowed = allowed && hasAny(anyOf);
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
