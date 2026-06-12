import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRoleStore } from '../../domain/store/roleStore';
import { roleGateway } from '../../infrastructure/roleGateway';
import type { Role } from '../../domain/models/role';
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
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { formatCreated } from '@/lib/dates';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Plus, Pencil, Trash2, Shield, Undo2, Power, Eye } from 'lucide-react';
import { RoleDetail } from '../components/RoleDetail';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';
import { cn } from '@/lib/utils';

type SortBy = 'name' | 'createdAt' | 'updatedAt';
type Origin = 'all' | 'system' | 'custom';
type Deletion = 'active' | 'deleted' | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';

const SYSTEM_TOOLTIP = 'Los roles del sistema no se pueden modificar';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    origin: (sp.get('origin') as Origin) ?? 'all',
    status: (sp.get('status') as StatusFilter) ?? 'all',
    deletion: (sp.get('deletion') as Deletion) ?? 'active',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

function StatusBadge({ role }: { role: Role }) {
  if (role.deletedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  }
  if (role.isActive === false) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitado
    </span>
  );
}

export function RoleList() {
  const { roles, metadata, isLoading, error, setQuery, fetch, remove } = useRoleStore();
  const { has } = usePermissions();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [hardConfirm, setHardConfirm] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Role | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Role | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const canSeeDeleted = has(PERMISSIONS.ROLES.HARD_DELETE) || has(PERMISSIONS.ROLES.RESTORE);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
      origin: filters.origin,
      isActive:
        filters.status === 'all' ? undefined : filters.status === 'active' ? true : false,
      withDeleted: filters.deletion === 'all',
      onlyDeleted: filters.deletion === 'deleted',
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    void fetch();
  }, [
    filters.page,
    filters.limit,
    filters.search,
    filters.origin,
    filters.status,
    filters.deletion,
    filters.sortBy,
    filters.sortDir,
    setQuery,
    fetch,
  ]);

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

  const onSort = (column: SortBy, dir: SortDir) =>
    updateParam({ sortBy: column, sortDir: dir });
  const onPage = (page: number) => updateParam({ page: String(page) }, false);

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.origin !== 'all' ||
    filters.status !== 'all' ||
    filters.deletion !== 'active';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      setActionLoading(true);
      await roleGateway.restore(restoreTarget.id);
      notify.success('Rol restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar el rol.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await roleGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Rol movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el rol.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmToggleActive = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await roleGateway.toggleActive(toggleTarget.id);
      notify.success(`Rol ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
      setToggleTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo cambiar el estado del rol.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardDelete = async () => {
    if (!deleteTarget) return;
    if (hardConfirm < 1) {
      setHardConfirm(1);
      return;
    }
    try {
      setActionLoading(true);
      await roleGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Rol eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirm(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el rol.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Roles y permisos
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} roles en total
          </p>
        </div>
        <Can permission={PERMISSIONS.ROLES.CREATE}>
          <Link to="/roles/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo rol
            </Button>
          </Link>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar rol…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select value={filters.origin} onValueChange={(v) => updateParam({ origin: v })}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Origen: todos</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                  <SelectItem value="custom">Personalizados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => updateParam({ status: v })}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todos</SelectItem>
                  <SelectItem value="active">Solo habilitados</SelectItem>
                  <SelectItem value="inactive">Solo deshabilitados</SelectItem>
                </SelectContent>
              </Select>
              {canSeeDeleted ? (
                <Select
                  value={filters.deletion}
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
                  column="name"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Rol
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Descripción
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Permisos
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
              <SkeletonTableRows rows={5} columns={6} />
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay roles'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Creá el primer rol para asignar permisos.'
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
              roles.map((role) => {
                const isSystem = !!role.isSystem;
                return (
                  <TableRow
                    key={role.id}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">
                            {role.name}
                          </span>
                          {isSystem ? <Badge variant="default">Sistema</Badge> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground max-w-xs truncate">
                      {role.description ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge variant="outline">{role.permissions?.length ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <StatusBadge role={role} />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCreated(role.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-center gap-0.5">
                        <Can permission={PERMISSIONS.ROLES.LIST}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver detalle"
                            onClick={() => setViewTargetId(role.id)}
                            className="w-8 h-8"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Can>
                        {role.deletedAt ? (
                          <Can permission={PERMISSIONS.ROLES.RESTORE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Restaurar"
                              onClick={() => setRestoreTarget(role)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can permission={PERMISSIONS.ROLES.UPDATE}>
                              {isSystem ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={SYSTEM_TOOLTIP}
                                  disabled
                                  className="w-8 h-8 opacity-50 cursor-not-allowed"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Link to={`/roles/edit/${role.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Editar"
                                    className="w-8 h-8"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </Link>
                              )}
                            </Can>
                            <Can permission={PERMISSIONS.ROLES.TOGGLE_ACTIVE}>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={
                                  isSystem
                                    ? 'Los roles del sistema no se pueden deshabilitar'
                                    : role.isActive === false
                                      ? 'Habilitar'
                                      : 'Deshabilitar'
                                }
                                onClick={() => {
                                  if (isSystem) return;
                                  setToggleTarget(role);
                                }}
                                disabled={isSystem || actionLoading}
                                className={cn(
                                  'w-8 h-8',
                                  isSystem && 'opacity-50 cursor-not-allowed',
                                )}
                              >
                                <Power className="w-4 h-4" />
                              </Button>
                            </Can>
                            <Can
                              anyOf={[
                                PERMISSIONS.ROLES.SOFT_DELETE,
                                PERMISSIONS.ROLES.HARD_DELETE,
                              ]}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive',
                                  isSystem && 'opacity-50 cursor-not-allowed',
                                )}
                                title={isSystem ? SYSTEM_TOOLTIP : 'Eliminar'}
                                onClick={() => {
                                  if (isSystem) return;
                                  setDeleteTarget(role);
                                  setHardConfirm(0);
                                }}
                                disabled={isSystem}
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
          itemLabel="roles"
        />
        </div>
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive === false ? 'success' : 'warning'}
        icon={Power}
        title={toggleTarget?.isActive === false ? '¿Habilitar rol?' : '¿Deshabilitar rol?'}
        description={
          toggleTarget ? (
            toggleTarget.isActive === false ? (
              <>
                Los usuarios con el rol <strong>{toggleTarget.name}</strong> volverán a recibir
                los permisos asociados.
              </>
            ) : (
              <>
                Los usuarios con el rol <strong>{toggleTarget.name}</strong> no recibirán los
                permisos asociados hasta que sea habilitado nuevamente.
              </>
            )
          ) : null
        }
        confirmLabel={toggleTarget?.isActive === false ? 'Habilitar' : 'Deshabilitar'}
        confirmVariant={toggleTarget?.isActive === false ? 'default' : 'destructive'}
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
        title="¿Restaurar rol?"
        description={
          restoreTarget ? (
            <>
              El rol <strong>{restoreTarget.name}</strong> volverá a estar disponible con sus
              permisos previos.
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
            setHardConfirm(0);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[460px] rounded-xl gap-4 p-0">
          <DialogIconHeader
            tone="destructive"
            icon={Trash2}
            title="¿Eliminar rol?"
            description={
              deleteTarget ? (
                <>
                  Vas a eliminar el rol <strong>{deleteTarget.name}</strong>. Elegí entre mover a
                  la papelera (reversible) o eliminar permanentemente.
                </>
              ) : null
            }
            onClose={() => {
              setDeleteTarget(null);
              setHardConfirm(0);
            }}
          />
          {hardConfirm === 1 ? (
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
            <Can permission={PERMISSIONS.ROLES.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.ROLES.HARD_DELETE}>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  void handleHardDelete();
                }}
                disabled={actionLoading}
              >
                {hardConfirm === 0 ? 'Eliminar permanentemente' : 'Confirmar eliminación'}
              </AlertDialogAction>
            </Can>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RoleDetail
        roleId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
