import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePatientStore } from '../../domain/store/patientStore';
import { patientGateway } from '../../infrastructure/patientGateway';
import { fullName, type Patient } from '../../domain/models/patient';
import { Button } from '@/components/ui/button';
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
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Plus, Pencil, Trash2, Power, Undo2, UserRound, Eye } from 'lucide-react';
import { PatientDetail } from '../components/PatientDetail';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';

type SortBy = 'firstName' | 'lastName' | 'cedula' | 'email' | 'createdAt' | 'updatedAt';
type StatusFilter = 'all' | 'active' | 'inactive';
type Deletion = 'active' | 'deleted' | 'all';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') as StatusFilter) ?? 'all',
    deletion: (sp.get('deletion') as Deletion) ?? 'active',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

function patientInitials(p: Pick<Patient, 'firstName' | 'lastName'>) {
  return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || 'P';
}

function StatusBadge({ p }: { p: Patient }) {
  if (p.deletedAt)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  if (p.isActive)
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

export function PatientList() {
  const { patients, metadata, isLoading, error, setQuery, fetch, remove } =
    usePatientStore();
  const { has } = usePermissions();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [hardConfirm, setHardConfirm] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Patient | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Patient | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const canSeeDeleted =
    has(PERMISSIONS.PATIENTS.HARD_DELETE) || has(PERMISSIONS.PATIENTS.RESTORE);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
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
    filters.status !== 'all' ||
    filters.deletion !== 'active';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await patientGateway.toggleActive(toggleTarget.id);
      notify.success(`Paciente ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
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
      await patientGateway.restore(restoreTarget.id);
      notify.success('Paciente restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar el paciente.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await patientGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Paciente movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el paciente.');
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
      await patientGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Paciente eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirm(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el paciente.');
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
            Pacientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} pacientes en total
          </p>
        </div>
        <Can permission={PERMISSIONS.PATIENTS.CREATE}>
          <Link to="/patients/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo paciente
            </Button>
          </Link>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por nombre, cédula o email…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
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
                  Paciente
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="cedula"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Cédula
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Teléfono
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
            ) : patients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={UserRound}
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay pacientes'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Creá el primer paciente para empezar a registrar atenciones.'
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
              patients.map((p) => (
                <TableRow key={p.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {patientInitials(p)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">
                          {fullName(p)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-muted-foreground">
                    {p.cedula}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {p.phones?.[0]?.number ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <StatusBadge p={p} />
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Can permission={PERMISSIONS.PATIENTS.VIEW}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={() => setViewTargetId(p.id)}
                          className="w-8 h-8"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Can>
                      {p.deletedAt ? (
                        <Can permission={PERMISSIONS.PATIENTS.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(p)}
                            disabled={actionLoading}
                            className="w-8 h-8"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can permission={PERMISSIONS.PATIENTS.UPDATE}>
                            <Link to={`/patients/edit/${p.id}`}>
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
                          <Can permission={PERMISSIONS.PATIENTS.TOGGLE_ACTIVE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={p.isActive ? 'Deshabilitar' : 'Habilitar'}
                              onClick={() => setToggleTarget(p)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can
                            anyOf={[
                              PERMISSIONS.PATIENTS.SOFT_DELETE,
                              PERMISSIONS.PATIENTS.HARD_DELETE,
                            ]}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                              title="Eliminar"
                              onClick={() => {
                                setDeleteTarget(p);
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
          itemLabel="pacientes"
        />
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive ? 'warning' : 'success'}
        icon={Power}
        title={toggleTarget?.isActive ? '¿Deshabilitar paciente?' : '¿Habilitar paciente?'}
        description={
          toggleTarget ? (
            toggleTarget.isActive ? (
              <>
                El paciente <strong>{fullName(toggleTarget)}</strong> dejará de aparecer
                como activo en listados y nuevas atenciones.
              </>
            ) : (
              <>
                El paciente <strong>{fullName(toggleTarget)}</strong> volverá a estar
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
        title="¿Restaurar paciente?"
        description={
          restoreTarget ? (
            <>
              El paciente <strong>{fullName(restoreTarget)}</strong> volverá a estar
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
            title="¿Eliminar paciente?"
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
            <Can permission={PERMISSIONS.PATIENTS.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.PATIENTS.HARD_DELETE}>
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

      <PatientDetail
        patientId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
