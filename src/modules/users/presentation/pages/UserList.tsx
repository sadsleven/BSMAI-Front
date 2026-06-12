import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUserStore } from '../../domain/store/userStore';
import { userGateway } from '../../infrastructure/userGateway';
import { fullName, type User } from '../../domain/models/user';
import { roleGateway } from '@/modules/roles/infrastructure/roleGateway';
import type { Role } from '@/modules/roles/domain/models/role';
import { branchGateway } from '@/modules/branches/infrastructure/branchGateway';
import type { Branch } from '@/modules/branches/domain/models/branch';
import { Button } from '@/components/ui/button';
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
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  ConfirmDialog,
  DialogIconHeader,
  DialogBanner,
} from '@/components/ui/confirm-dialog';
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
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { formatCreated } from '@/lib/dates';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Power,
  Crown,
  Undo2,
  Filter,
  ChevronDown,
  Eye,
} from 'lucide-react';
import { UserDetail } from '../components/UserDetail';
import { Can } from '@/modules/auth/presentation/components/Can';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { getRowActionsState } from '../rowActions';
import { cn } from '@/lib/utils';

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
    branchId: sp.get('branchId') ?? '',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

function userInitials(u: Pick<User, 'firstName' | 'lastName'>) {
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || 'U';
}

function StatusBadge({ user }: { user: User }) {
  if (user.deletedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  }
  if (user.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitado
    </span>
  );
}

export function UserList() {
  const { users, metadata, isLoading, error, setQuery, fetch, remove } = useUserStore();
  const { has } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const canSeeDeleted = has(PERMISSIONS.USERS.HARD_DELETE) || has(PERMISSIONS.USERS.RESTORE);

  useEffect(() => {
    (async () => {
      try {
        setRoles(await roleGateway.listAll());
      } catch {
        setRoles([]);
      }
    })();
    (async () => {
      try {
        setBranches(await branchGateway.listAssignable());
      } catch {
        setBranches([]);
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
      branchId: filters.branchId || undefined,
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
    filters.branchId,
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

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.status !== 'all' ||
    filters.roleIds.length > 0 ||
    Boolean(filters.branchId) ||
    filters.deletion !== 'active';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [hardConfirmStep, setHardConfirmStep] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<User | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<User | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

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
      <PageBreadcrumbs />
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} usuarios en total
          </p>
        </div>
        <Can permission={PERMISSIONS.USERS.CREATE}>
          <Link to="/users/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo usuario
            </Button>
          </Link>
        </Can>
      </div>

      {/* Card: toolbar + table + pagination */}
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por nombre o email…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select value={filters.status} onValueChange={(v) => updateParam({ status: v })}>
                <SelectTrigger className="h-9 w-40">
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
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <Filter className="w-4 h-4" />
                    Roles{filters.roleIds.length ? ` (${filters.roleIds.length})` : ''}
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
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

              <Select
                value={filters.branchId || 'all'}
                onValueChange={(v) => updateParam({ branchId: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sucursal: todas</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canSeeDeleted ? (
                <Select
                  value={filteredDeletion}
                  onValueChange={(v) => updateParam({ deletion: v })}
                >
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="deleted">En papelera</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </>
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <div className="m-4 rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="firstName"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Usuario
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Teléfono
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Roles
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Sucursales
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Estado
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Creación
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTableRows rows={5} columns={7} />
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay usuarios'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Creá el primer usuario para empezar a operar.'
                    }
                    action={
                      hasActiveFilters ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Limpiar filtros
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const state = getRowActionsState(user, me);
                return (
                  <TableRow
                    key={user.id}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {userInitials(user)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground truncate">
                            {fullName(user)}
                            {user.isSuperAdmin ? (
                              <Badge variant="default" className="gap-1">
                                <Crown className="w-3 h-3" /> Super Admin
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {user.phoneNumber ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.length
                          ? user.roles.map((r) => (
                              <Badge key={r.id} variant="secondary">
                                {r.name}
                              </Badge>
                            ))
                          : <span className="text-sm text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      {user.isSuperAdmin ? (
                        <Badge variant="default" className="gap-1">
                          <Crown className="w-3 h-3" /> Todas
                        </Badge>
                      ) : user.branches?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {user.branches.slice(0, 2).map((b) => (
                            <Badge key={b.id} variant="secondary">
                              {b.name}
                            </Badge>
                          ))}
                          {user.branches.length > 2 ? (
                            <Badge variant="outline">+{user.branches.length - 2}</Badge>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <StatusBadge user={user} />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCreated(user.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-center gap-0.5">
                        <Can permission={PERMISSIONS.USERS.LIST}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver detalle"
                            onClick={() => setViewTargetId(user.id)}
                            className="w-8 h-8"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Can>
                        {state.canRestore ? (
                          <Can permission={PERMISSIONS.USERS.RESTORE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Restaurar"
                              onClick={() => setRestoreTarget(user)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can permission={PERMISSIONS.USERS.UPDATE}>
                              {state.canEdit ? (
                                <Link to={`/users/edit/${user.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Editar"
                                    className="w-8 h-8"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </Link>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={state.reason ?? 'Editar'}
                                  disabled
                                  className="w-8 h-8 opacity-50 cursor-not-allowed"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </Can>
                            <Can anyOf={[PERMISSIONS.USERS.CHANGE_PASSWORD]}>
                              {state.canChangePassword ? (
                                <Link to={`/users/${user.id}/change-password`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Cambiar contraseña"
                                    className="w-8 h-8"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </Button>
                                </Link>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={state.reason ?? 'Cambiar contraseña'}
                                  disabled
                                  className="w-8 h-8 opacity-50 cursor-not-allowed"
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
                                className={cn(
                                  'w-8 h-8',
                                  !state.canToggleActive && 'opacity-50 cursor-not-allowed',
                                )}
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
                                className={cn(
                                  'w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive',
                                  !state.canDelete && 'opacity-50 cursor-not-allowed',
                                )}
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={metadata.page}
          pageSize={filters.limit}
          total={metadata.total}
          lastPage={metadata.lastPage}
          onPageChange={onPage}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="usuarios"
        />
        </div>
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive ? 'warning' : 'success'}
        icon={Power}
        title={toggleTarget?.isActive ? '¿Deshabilitar usuario?' : '¿Habilitar usuario?'}
        description={
          toggleTarget ? (
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
          ) : null
        }
        confirmLabel={toggleTarget?.isActive ? 'Deshabilitar' : 'Habilitar'}
        confirmVariant={toggleTarget?.isActive ? 'destructive' : 'default'}
        loading={actionLoading}
        onConfirm={confirmToggleActive}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        tone="success"
        icon={Undo2}
        title="¿Restaurar usuario?"
        description={
          restoreTarget ? (
            <>
              El usuario <strong>{fullName(restoreTarget)}</strong> volverá a estar disponible
              con su configuración previa (roles, estado y permisos).
            </>
          ) : null
        }
        confirmLabel="Restaurar"
        loading={actionLoading}
        onConfirm={confirmRestore}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setHardConfirmStep(0);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[460px] rounded-xl gap-4 p-0">
          <DialogIconHeader
            tone="destructive"
            icon={Trash2}
            title="¿Eliminar usuario?"
            description={
              deleteTarget ? (
                <>
                  Vas a eliminar a <strong>{fullName(deleteTarget)}</strong>. Elegí entre mover a
                  la papelera (reversible) o eliminar permanentemente.
                </>
              ) : null
            }
            onClose={() => {
              setDeleteTarget(null);
              setHardConfirmStep(0);
            }}
          />
          {hardConfirmStep === 1 ? (
            <div className="px-6">
              <DialogBanner tone="destructive">
                Esta acción es irreversible. Confirmá de nuevo para eliminar permanentemente.
              </DialogBanner>
            </div>
          ) : null}
          <AlertDialogFooter className="px-6 pb-5 pt-2 flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={actionLoading} className="sm:mr-auto">
              Cancelar
            </AlertDialogCancel>
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

      <UserDetail
        userId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
