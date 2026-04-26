import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRoleStore } from '../../domain/store/roleStore';
import { roleGateway } from '../../infrastructure/roleGateway';
import type { Role } from '../../domain/models/role';
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
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { Plus, Pencil, Trash2, Shield, Undo2, Power } from 'lucide-react';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';

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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold">Roles</h1>
        <Can permission={PERMISSIONS.ROLES.CREATE}>
          <Link to="/roles/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo rol
            </Button>
          </Link>
        </Can>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar rol..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filters.origin} onValueChange={(v) => updateParam({ origin: v })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Origen: todos</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
            <SelectItem value="custom">Personalizados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => updateParam({ status: v })}>
          <SelectTrigger className="w-44">
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
                  column="name"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Nombre
                </SortableHeader>
              </TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No hay roles.
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => {
                const isSystem = !!role.isSystem;
                return (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        {role.name}
                        {isSystem ? <Badge variant="default">Sistema</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{role.description ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{role.permissions?.length ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      {role.deletedAt ? (
                        <Badge variant="destructive">Eliminado</Badge>
                      ) : role.isActive === false ? (
                        <Badge variant="outline">Deshabilitado</Badge>
                      ) : (
                        <Badge variant="secondary">Habilitado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {role.deletedAt ? (
                        <Can permission={PERMISSIONS.ROLES.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(role)}
                            disabled={actionLoading}
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
                                className="opacity-50 cursor-not-allowed"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Link to={`/roles/edit/${role.id}`}>
                                <Button variant="ghost" size="icon" title="Editar">
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
                              className={isSystem ? 'opacity-50 cursor-not-allowed' : ''}
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
                              className={
                                isSystem
                                  ? 'opacity-50 cursor-not-allowed text-destructive'
                                  : 'text-destructive'
                              }
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
          Mostrando {roles.length} de {metadata.total}
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
              {toggleTarget?.isActive === false ? '¿Habilitar rol?' : '¿Deshabilitar rol?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget ? (
                toggleTarget.isActive === false ? (
                  <>
                    Los usuarios con el rol <strong>{toggleTarget.name}</strong> volverán a
                    recibir los permisos asociados.
                  </>
                ) : (
                  <>
                    Los usuarios con el rol <strong>{toggleTarget.name}</strong> no recibirán los
                    permisos asociados hasta que sea habilitado nuevamente.
                  </>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={toggleTarget?.isActive === false ? 'default' : 'destructive'}
              onClick={(e) => {
                e.preventDefault();
                void confirmToggleActive();
              }}
              disabled={actionLoading}
            >
              {toggleTarget?.isActive === false ? 'Habilitar' : 'Deshabilitar'}
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
            <AlertDialogTitle>¿Restaurar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget ? (
                <>
                  El rol <strong>{restoreTarget.name}</strong> volverá a estar disponible con sus
                  permisos previos.
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
            setHardConfirm(0);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  ¿Cómo querés eliminar el rol <strong>{deleteTarget.name}</strong>?
                  {hardConfirm === 1 ? (
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
    </div>
  );
}
