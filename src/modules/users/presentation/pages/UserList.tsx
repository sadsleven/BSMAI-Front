import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUserStore } from '../../domain/store/userStore';
import { userGateway } from '../../infrastructure/userGateway';
import { fullName, type User } from '../../domain/models/user';
import { roleGateway } from '@/modules/roles/infrastructure/roleGateway';
import type { Role } from '@/modules/roles/domain/models/role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { Plus, Pencil, Trash2, KeyRound, Power, Crown, Undo2, Filter } from 'lucide-react';
import { Can } from '@/modules/auth/presentation/components/Can';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { getRowActionsState } from '../rowActions';

type SortBy = 'firstName' | 'lastName' | 'email' | 'createdAt' | 'updatedAt';
type StatusFilter = 'all' | 'active' | 'inactive';
type DeletionFilter = 'active' | 'deleted' | 'all';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') as StatusFilter) ?? 'all',
    deletion: (sp.get('deletion') as DeletionFilter) ?? 'active',
    roleIds: sp.get('roleIds') ? sp.get('roleIds')!.split(',').filter(Boolean) : [],
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

export function UserList() {
  const { users, metadata, isLoading, error, setQuery, fetch, remove } = useUserStore();
  const { has } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [roles, setRoles] = useState<Role[]>([]);

  const canSeeDeleted = has(PERMISSIONS.USERS.HARD_DELETE) || has(PERMISSIONS.USERS.RESTORE);

  useEffect(() => {
    (async () => {
      try {
        setRoles(await roleGateway.listAll());
      } catch {
        setRoles([]);
      }
    })();
  }, []);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
      isActive:
        filters.status === 'all' ? undefined : filters.status === 'active' ? true : false,
      withDeleted: filters.deletion === 'all',
      onlyDeleted: filters.deletion === 'deleted',
      roleIds: filters.roleIds.length ? filters.roleIds : undefined,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    void fetch();
  }, [
    filters.page,
    filters.limit,
    filters.search,
    filters.status,
    filters.deletion,
    filters.roleIds.join(','),
    filters.sortBy,
    filters.sortDir,
    setQuery,
    fetch,
  ]);

  // Debounce search → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === filters.search) return;
      const next = new URLSearchParams(sp);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      next.set('page', '1');
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.set('page', '1');
    setSp(next, { replace: true });
  };

  const onSort = (column: SortBy, dir: SortDir) => updateParam({ sortBy: column, sortDir: dir });

  const onPage = (page: number) => updateParam({ page: String(page) }, false);

  const toggleRoleId = (id: string) => {
    const ids = filters.roleIds.includes(id)
      ? filters.roleIds.filter((r) => r !== id)
      : [...filters.roleIds, id];
    updateParam({ roleIds: ids.length ? ids.join(',') : undefined });
  };

  const filteredDeletion: DeletionFilter = canSeeDeleted ? filters.deletion : 'active';

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [hardConfirmStep, setHardConfirmStep] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<User | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<User | null>(null);

  const confirmToggleActive = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await userGateway.toggleActive(toggleTarget.id);
      notify.success(`Usuario ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
      setToggleTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo cambiar el estado.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      setActionLoading(true);
      await userGateway.restore(restoreTarget.id);
      notify.success('Usuario restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar el usuario.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await userGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Usuario movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el usuario.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardDelete = async () => {
    if (!deleteTarget) return;
    if (hardConfirmStep < 1) {
      setHardConfirmStep(1);
      return;
    }
    try {
      setActionLoading(true);
      await userGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Usuario eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirmStep(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el usuario.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold">Usuarios</h1>
        <Can permission={PERMISSIONS.USERS.CREATE}>
          <Link to="/users/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo usuario
            </Button>
          </Link>
        </Can>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar por nombre o email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />

        <Select value={filters.status} onValueChange={(v) => updateParam({ status: v })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado: todos</SelectItem>
            <SelectItem value="active">Solo habilitados</SelectItem>
            <SelectItem value="inactive">Solo deshabilitados</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Roles{filters.roleIds.length ? ` (${filters.roleIds.length})` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>Filtrar por rol</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {roles.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Sin roles</div>
            ) : (
              roles.map((r) => (
                <DropdownMenuCheckboxItem
                  key={r.id}
                  checked={filters.roleIds.includes(r.id)}
                  onCheckedChange={() => toggleRoleId(r.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {r.name}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {canSeeDeleted ? (
          <Select
            value={filteredDeletion}
            onValueChange={(v) => updateParam({ deletion: v })}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="deleted">En papelera</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader<SortBy>
                  column="firstName"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Nombre
                </SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader<SortBy>
                  column="email"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Email
                </SortableHeader>
              </TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay usuarios.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const state = getRowActionsState(user, me);
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {fullName(user)}
                        {user.isSuperAdmin ? (
                          <Badge variant="default" className="gap-1">
                            <Crown className="w-3 h-3" /> Super Admin
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.phoneNumber ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.length
                          ? user.roles.map((r) => (
                              <Badge key={r.id} variant="secondary">
                                {r.name}
                              </Badge>
                            ))
                          : '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.deletedAt ? (
                        <Badge variant="destructive">Eliminado</Badge>
                      ) : user.isActive ? (
                        <Badge variant="secondary">Habilitado</Badge>
                      ) : (
                        <Badge variant="outline">Deshabilitado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {state.canRestore ? (
                        <Can permission={PERMISSIONS.USERS.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(user)}
                            disabled={actionLoading}
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can permission={PERMISSIONS.USERS.UPDATE}>
                            {state.canEdit ? (
                              <Link to={`/users/edit/${user.id}`}>
                                <Button variant="ghost" size="icon" title="Editar">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={state.reason ?? 'Editar'}
                                disabled
                                className="opacity-50 cursor-not-allowed"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                          </Can>
                          <Can anyOf={[PERMISSIONS.USERS.CHANGE_PASSWORD]}>
                            {state.canChangePassword ? (
                              <Link to={`/users/${user.id}/change-password`}>
                                <Button variant="ghost" size="icon" title="Cambiar contraseña">
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={state.reason ?? 'Cambiar contraseña'}
                                disabled
                                className="opacity-50 cursor-not-allowed"
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                            )}
                          </Can>
                          <Can permission={PERMISSIONS.USERS.TOGGLE_ACTIVE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                state.canToggleActive
                                  ? user.isActive
                                    ? 'Deshabilitar'
                                    : 'Habilitar'
                                  : state.reason ?? ''
                              }
                              onClick={() => state.canToggleActive && setToggleTarget(user)}
                              disabled={actionLoading || !state.canToggleActive}
                              className={!state.canToggleActive ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can
                            anyOf={[
                              PERMISSIONS.USERS.SOFT_DELETE,
                              PERMISSIONS.USERS.HARD_DELETE,
                            ]}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className={
                                state.canDelete
                                  ? 'text-destructive'
                                  : 'opacity-50 cursor-not-allowed text-destructive'
                              }
                              title={state.canDelete ? 'Eliminar' : state.reason ?? ''}
                              onClick={() => {
                                if (!state.canDelete) return;
                                setDeleteTarget(user);
                                setHardConfirmStep(0);
                              }}
                              disabled={!state.canDelete}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </Can>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Mostrando {users.length} de {metadata.total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={metadata.page <= 1 || isLoading}
            onClick={() => onPage(metadata.page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">
            Página {metadata.page} de {Math.max(metadata.lastPage, 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={metadata.page >= metadata.lastPage || isLoading}
            onClick={() => onPage(metadata.page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? '¿Deshabilitar usuario?' : '¿Habilitar usuario?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget ? (
                toggleTarget.isActive ? (
                  <>
                    El usuario <strong>{fullName(toggleTarget)}</strong> no podrá iniciar sesión
                    hasta que sea habilitado nuevamente.
                  </>
                ) : (
                  <>
                    El usuario <strong>{fullName(toggleTarget)}</strong> podrá volver a iniciar
                    sesión y acceder al sistema.
                  </>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={toggleTarget?.isActive ? 'destructive' : 'default'}
              onClick={(e) => {
                e.preventDefault();
                void confirmToggleActive();
              }}
              disabled={actionLoading}
            >
              {toggleTarget?.isActive ? 'Deshabilitar' : 'Habilitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget ? (
                <>
                  El usuario <strong>{fullName(restoreTarget)}</strong> volverá a estar disponible
                  con su configuración previa (roles, estado y permisos).
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRestore();
              }}
              disabled={actionLoading}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setHardConfirmStep(0);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  ¿Cómo querés eliminar a <strong>{fullName(deleteTarget)}</strong>?
                  {hardConfirmStep === 1 ? (
                    <span className="block mt-2 text-destructive font-medium">
                      Esta acción es irreversible. Confirmar de nuevo para continuar.
                    </span>
                  ) : null}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Can permission={PERMISSIONS.USERS.SOFT_DELETE}>
              <AlertDialogAction
                variant="default"
                onClick={(e) => {
                  e.preventDefault();
                  void handleSoftDelete();
                }}
                disabled={actionLoading}
              >
                Mover a la papelera
              </AlertDialogAction>
            </Can>
            <Can permission={PERMISSIONS.USERS.HARD_DELETE}>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  void handleHardDelete();
                }}
                disabled={actionLoading}
              >
                {hardConfirmStep === 0 ? 'Eliminar permanentemente' : 'Confirmar eliminación'}
              </AlertDialogAction>
            </Can>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
