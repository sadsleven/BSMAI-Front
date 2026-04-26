import type { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface CanProps {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, anyOf, fallback = null, children }: CanProps) {
  const { has, hasAny } = usePermissions();
  let allowed = true;
  if (permission) allowed = has(permission);
  if (anyOf && anyOf.length > 0) allowed = allowed && hasAny(anyOf);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
