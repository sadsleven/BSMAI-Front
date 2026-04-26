import type { User } from '../domain/models/user';
import type { AuthUser } from '@/modules/auth/domain/models/authUser';

export interface RowActionsState {
  canEdit: boolean;
  canChangePassword: boolean;
  canToggleActive: boolean;
  canDelete: boolean;
  canRestore: boolean;
  reason: string | null;
}

const SELF_REASON = 'Usá Mi perfil para modificar tus propios datos';
const SUPER_ADMIN_REASON = 'No se puede modificar a un Super Administrador desde esta tabla';

/**
 * Centralizes row-level rules for the users table.
 * - A user cannot act on its own row → must use /profile.
 * - No user can act on a Super Admin row from this table.
 * - Soft-deleted rows only expose restore.
 */
export function getRowActionsState(row: User, currentUser: AuthUser | null): RowActionsState {
  if (row.deletedAt) {
    return {
      canEdit: false,
      canChangePassword: false,
      canToggleActive: false,
      canDelete: false,
      canRestore: true,
      reason: null,
    };
  }
  if (currentUser && currentUser.id === row.id) {
    return {
      canEdit: false,
      canChangePassword: false,
      canToggleActive: false,
      canDelete: false,
      canRestore: false,
      reason: SELF_REASON,
    };
  }
  if (row.isSuperAdmin) {
    return {
      canEdit: false,
      canChangePassword: false,
      canToggleActive: false,
      canDelete: false,
      canRestore: false,
      reason: SUPER_ADMIN_REASON,
    };
  }
  return {
    canEdit: true,
    canChangePassword: true,
    canToggleActive: true,
    canDelete: true,
    canRestore: false,
    reason: null,
  };
}
