import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDoctorStore } from '../../domain/store/doctorStore';
import { doctorGateway } from '../../infrastructure/doctorGateway';
import { fullName, type Doctor } from '../../domain/models/doctor';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Plus, Pencil, Trash2, Power, Undo2, Stethoscope, Eye } from 'lucide-react';
import { DoctorDetail } from '../components/DoctorDetail';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';

type SortBy = 'firstName' | 'lastName' | 'cedula' | 'email' | 'createdAt' | 'updatedAt';
type StatusFilter = 'all' | 'active' | 'inactive';
type Deletion = 'active' | 'deleted' | 'all';
type EntityType = 'all' | 'natural' | 'legal';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') as StatusFilter) ?? 'all',
    deletion: (sp.get('deletion') as Deletion) ?? 'active',
    entityType: (sp.get('entityType') as EntityType) ?? 'all',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

function doctorInitials(d: Pick<Doctor, 'firstName' | 'lastName'>) {
  return `${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || 'D';
}

function StatusBadge({ d }: { d: Doctor }) {
  if (d.deletedAt)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  if (d.isActive)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitado
    </span>
  );
}

export function DoctorList() {
  const { doctors, metadata, isLoading, error, setQuery, fetch, remove } =
    useDoctorStore();
  const { has } = usePermissions();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [hardConfirm, setHardConfirm] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Doctor | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Doctor | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const canSeeDeleted =
    has(PERMISSIONS.DOCTORS.HARD_DELETE) || has(PERMISSIONS.DOCTORS.RESTORE);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
      isActive:
        filters.status === 'all' ? undefined : filters.status === 'active' ? true : false,
      withDeleted: filters.deletion === 'all',
      onlyDeleted: filters.deletion === 'deleted',
      entityType: filters.entityType,
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
    filters.entityType,
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
    filters.status !== 'all' ||
    filters.deletion !== 'active' ||
    filters.entityType !== 'all';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await doctorGateway.toggleActive(toggleTarget.id);
      notify.success(`Doctor ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
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
      await doctorGateway.restore(restoreTarget.id);
      notify.success('Doctor restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar el doctor.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await doctorGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Doctor movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el doctor.');
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
      await doctorGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Doctor eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirm(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el doctor.');
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
            Doctores
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} doctores en total
          </p>
        </div>
        <Can permission={PERMISSIONS.DOCTORS.CREATE}>
          <Link to="/doctors/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo doctor
            </Button>
          </Link>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por nombre, cédula, email o RIF…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select
                value={filters.entityType}
                onValueChange={(v) => updateParam({ entityType: v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  <SelectItem value="natural">Persona natural</SelectItem>
                  <SelectItem value="legal">Persona jurídica</SelectItem>
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

        <Table>
          <TableHeader>
            <TableRow className="bg-[oklch(0.985_0.003_250)] hover:bg-[oklch(0.985_0.003_250)]">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="firstName"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Doctor
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="cedula"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Cédula / RIF
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Especialidades
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Estado
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTableRows rows={5} columns={5} />
            ) : doctors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Stethoscope}
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay doctores'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Creá el primer doctor para empezar a registrar atenciones.'
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
              doctors.map((d) => (
                <TableRow key={d.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {doctorInitials(d)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate flex items-center gap-2">
                          {fullName(d)}
                          {d.isLegalEntity && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                              Jurídica
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {d.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-muted-foreground">
                    <div>{d.cedula}</div>
                    {d.rif && <div className="text-xs">{d.rif}</div>}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1 max-w-[280px]">
                      {(d.specialties ?? []).slice(0, 3).map((s) => (
                        <Badge
                          key={s.id}
                          variant="outline"
                          className="text-[10px] py-0 px-1.5"
                        >
                          {s.name}
                        </Badge>
                      ))}
                      {(d.specialties?.length ?? 0) > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{(d.specialties?.length ?? 0) - 3}
                        </span>
                      )}
                      {(d.specialties?.length ?? 0) === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <StatusBadge d={d} />
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Can permission={PERMISSIONS.DOCTORS.VIEW}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={() => setViewTargetId(d.id)}
                          className="w-8 h-8"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Can>
                      {d.deletedAt ? (
                        <Can permission={PERMISSIONS.DOCTORS.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(d)}
                            disabled={actionLoading}
                            className="w-8 h-8"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can permission={PERMISSIONS.DOCTORS.UPDATE}>
                            <Link to={`/doctors/edit/${d.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar"
                                className="w-8 h-8"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </Link>
                          </Can>
                          <Can permission={PERMISSIONS.DOCTORS.TOGGLE_ACTIVE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={d.isActive ? 'Deshabilitar' : 'Habilitar'}
                              onClick={() => setToggleTarget(d)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can
                            anyOf={[
                              PERMISSIONS.DOCTORS.SOFT_DELETE,
                              PERMISSIONS.DOCTORS.HARD_DELETE,
                            ]}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                              title="Eliminar"
                              onClick={() => {
                                setDeleteTarget(d);
                                setHardConfirm(0);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </Can>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={metadata.page}
          pageSize={filters.limit}
          total={metadata.total}
          lastPage={metadata.lastPage}
          onPageChange={onPage}
          itemLabel="doctores"
        />
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive ? 'warning' : 'success'}
        icon={Power}
        title={toggleTarget?.isActive ? '¿Deshabilitar doctor?' : '¿Habilitar doctor?'}
        description={
          toggleTarget ? (
            toggleTarget.isActive ? (
              <>
                El doctor <strong>{fullName(toggleTarget)}</strong> dejará de aparecer
                como activo en listados y nuevas atenciones.
              </>
            ) : (
              <>
                El doctor <strong>{fullName(toggleTarget)}</strong> volverá a estar
                disponible para registrar atenciones.
              </>
            )
          ) : null
        }
        confirmLabel={toggleTarget?.isActive ? 'Deshabilitar' : 'Habilitar'}
        confirmVariant={toggleTarget?.isActive ? 'destructive' : 'default'}
        loading={actionLoading}
        onConfirm={confirmToggle}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        tone="success"
        icon={Undo2}
        title="¿Restaurar doctor?"
        description={
          restoreTarget ? (
            <>
              El doctor <strong>{fullName(restoreTarget)}</strong> volverá a estar
              disponible.
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
            title="¿Eliminar doctor?"
            description={
              deleteTarget ? (
                <>
                  Vas a eliminar a <strong>{fullName(deleteTarget)}</strong>. Elegí entre
                  mover a la papelera (reversible) o eliminar permanentemente.
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
            <Can permission={PERMISSIONS.DOCTORS.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.DOCTORS.HARD_DELETE}>
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

      <DoctorDetail
        doctorId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
