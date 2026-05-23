import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useContractorStore } from '../../domain/store/contractorStore';
import { contractorGateway } from '../../infrastructure/contractorGateway';
import type { Contractor } from '../../domain/models/contractor';
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
import { Plus, Pencil, Trash2, Power, Briefcase, Undo2, Eye } from 'lucide-react';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';
import { cn } from '@/lib/utils';
import { ContractorDetail } from '../components/ContractorDetail';

type SortBy = 'name' | 'createdAt' | 'updatedAt';
type Deletion = 'active' | 'deleted' | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';

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

function StatusBadge({ c }: { c: Contractor }) {
  if (c.deletedAt)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  if (!c.isActive)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitado
    </span>
  );
}

export function ContractorList() {
  const { contractors, metadata, isLoading, error, setQuery, fetch, remove } =
    useContractorStore();
  const { has } = usePermissions();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [hardConfirm, setHardConfirm] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Contractor | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Contractor | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const canSeeDeleted =
    has(PERMISSIONS.CONTRACTORS.HARD_DELETE) || has(PERMISSIONS.CONTRACTORS.RESTORE);

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
      await contractorGateway.toggleActive(toggleTarget.id);
      notify.success(`Contratista ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
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
      await contractorGateway.restore(restoreTarget.id);
      notify.success('Contratista restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar el contratista.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await contractorGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Contratista movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el contratista.');
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
      await contractorGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Contratista eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirm(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el contratista.');
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
            Contratistas
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} contratistas en total
          </p>
        </div>
        <Can permission={PERMISSIONS.CONTRACTORS.CREATE}>
          <Link to="/contractors/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo contratista
            </Button>
          </Link>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar contratista…"
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
                  column="name"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Contratista
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Descripción
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
              <SkeletonTableRows rows={5} columns={4} />
            ) : contractors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    icon={Briefcase}
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay contratistas'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Creá el primer contratista.'
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
              contractors.map((c) => (
                <TableRow key={c.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-foreground truncate">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground max-w-md truncate">
                    {c.description ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <StatusBadge c={c} />
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Can permission={PERMISSIONS.CONTRACTORS.VIEW}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={() => setViewTargetId(c.id)}
                          className="w-8 h-8"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Can>
                      {c.deletedAt ? (
                        <Can permission={PERMISSIONS.CONTRACTORS.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(c)}
                            disabled={actionLoading}
                            className="w-8 h-8"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can permission={PERMISSIONS.CONTRACTORS.UPDATE}>
                            <Link to={`/contractors/edit/${c.id}`}>
                              <Button variant="ghost" size="icon" title="Editar" className="w-8 h-8">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </Link>
                          </Can>
                          <Can permission={PERMISSIONS.CONTRACTORS.TOGGLE_ACTIVE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={c.isActive ? 'Deshabilitar' : 'Habilitar'}
                              onClick={() => setToggleTarget(c)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can
                            anyOf={[
                              PERMISSIONS.CONTRACTORS.SOFT_DELETE,
                              PERMISSIONS.CONTRACTORS.HARD_DELETE,
                            ]}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive',
                              )}
                              title="Eliminar"
                              onClick={() => {
                                setDeleteTarget(c);
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
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="contratistas"
        />
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive ? 'warning' : 'success'}
        icon={Power}
        title={toggleTarget?.isActive ? '¿Deshabilitar contratista?' : '¿Habilitar contratista?'}
        description={
          toggleTarget ? (
            toggleTarget.isActive ? (
              <>
                El contratista <strong>{toggleTarget.name}</strong> dejará de estar disponible.
              </>
            ) : (
              <>
                El contratista <strong>{toggleTarget.name}</strong> volverá a estar disponible.
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
        title="¿Restaurar contratista?"
        description={
          restoreTarget ? (
            <>
              El contratista <strong>{restoreTarget.name}</strong> volverá a estar disponible.
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
            title="¿Eliminar contratista?"
            description={
              deleteTarget ? (
                <>
                  Vas a eliminar el contratista <strong>{deleteTarget.name}</strong>.
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
            <Can permission={PERMISSIONS.CONTRACTORS.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.CONTRACTORS.HARD_DELETE}>
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

      <ContractorDetail
        contractorId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
