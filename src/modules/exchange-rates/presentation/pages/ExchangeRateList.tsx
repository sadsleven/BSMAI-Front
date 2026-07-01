import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useExchangeRateStore } from '../../domain/store/exchangeRateStore';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';
import type { Currency, ExchangeRate } from '../../domain/models/exchangeRate';
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
import { formatCreated } from '@/lib/dates';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Plus, Pencil, Trash2, Power, TrendingUp, Undo2, Eye } from 'lucide-react';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { notify } from '@/lib/notifications/toast';
import { cn } from '@/lib/utils';
import { ExchangeRateDetail } from '../components/ExchangeRateDetail';
import { formatBs } from '../utils/format';

type SortBy = 'effectiveDate' | 'amountBs' | 'currency' | 'createdAt' | 'updatedAt';
type Deletion = 'active' | 'deleted' | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';
type CurrencyFilter = Currency | 'all';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    status: (sp.get('status') as StatusFilter) ?? 'all',
    deletion: (sp.get('deletion') as Deletion) ?? 'active',
    currency: (sp.get('currency') as CurrencyFilter) ?? 'all',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'effectiveDate',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

function StatusBadge({ r }: { r: ExchangeRate }) {
  if (r.deletedAt)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive-soft text-destructive text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> En papelera
      </span>
    );
  if (!r.isActive)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitada
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitada
    </span>
  );
}

export function ExchangeRateList() {
  const { rates, metadata, isLoading, error, setQuery, fetch, remove } =
    useExchangeRateStore();
  const { has } = usePermissions();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRate | null>(null);
  const [hardConfirm, setHardConfirm] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<ExchangeRate | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ExchangeRate | null>(null);
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const canSeeDeleted =
    has(PERMISSIONS.EXCHANGE_RATES.HARD_DELETE) ||
    has(PERMISSIONS.EXCHANGE_RATES.RESTORE);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      isActive:
        filters.status === 'all' ? undefined : filters.status === 'active' ? true : false,
      withDeleted: filters.deletion === 'all',
      onlyDeleted: filters.deletion === 'deleted',
      currency: filters.currency === 'all' ? undefined : filters.currency,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    void fetch();
  }, [
    filters.page,
    filters.limit,
    filters.status,
    filters.deletion,
    filters.currency,
    filters.sortBy,
    filters.sortDir,
    setQuery,
    fetch,
  ]);

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
    filters.status !== 'all' ||
    filters.deletion !== 'active' ||
    filters.currency !== 'all';

  const clearFilters = () => {
    setSp(new URLSearchParams(), { replace: true });
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await exchangeRateGateway.toggleActive(toggleTarget.id);
      notify.success(`Tasa ${toggleTarget.isActive ? 'deshabilitada' : 'habilitada'}`);
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
      await exchangeRateGateway.restore(restoreTarget.id);
      notify.success('Tasa restaurada');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar la tasa.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await exchangeRateGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Tasa movida a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar la tasa.');
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
      await exchangeRateGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Tasa eliminada permanentemente');
      setDeleteTarget(null);
      setHardConfirm(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar la tasa.');
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
            Tasas de cambio
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} tasas en total
          </p>
        </div>
        <Can permission={PERMISSIONS.EXCHANGE_RATES.CREATE}>
          <Link to="/exchange-rates/create">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva tasa
            </Button>
          </Link>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select
                value={filters.currency}
                onValueChange={(v) => updateParam({ currency: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las monedas</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => updateParam({ status: v })}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todas</SelectItem>
                  <SelectItem value="active">Solo habilitadas</SelectItem>
                  <SelectItem value="inactive">Solo deshabilitadas</SelectItem>
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
                    <SelectItem value="active">Activas</SelectItem>
                    <SelectItem value="deleted">En papelera</SelectItem>
                    <SelectItem value="all">Todas</SelectItem>
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
                  column="currency"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Moneda
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="amountBs"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Monto (Bs.)
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="effectiveDate"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Fecha efectiva
                </SortableHeader>
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
            ) : rates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={TrendingUp}
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay tasas de cambio'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Crea la primera tasa de cambio.'
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
              rates.map((r) => (
                <TableRow key={r.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-foreground">{r.currency}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {formatBs(r.amountBs)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {new Date(r.effectiveDate).toLocaleString('es-VE', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <StatusBadge r={r} />
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatCreated(r.createdAt)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-center gap-0.5">
                      <Can permission={PERMISSIONS.EXCHANGE_RATES.LIST}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalle"
                          onClick={() => setViewTargetId(r.id)}
                          className="w-8 h-8"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Can>
                      {r.deletedAt ? (
                        <Can permission={PERMISSIONS.EXCHANGE_RATES.RESTORE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Restaurar"
                            onClick={() => setRestoreTarget(r)}
                            disabled={actionLoading}
                            className="w-8 h-8"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can permission={PERMISSIONS.EXCHANGE_RATES.UPDATE}>
                            <Link to={`/exchange-rates/edit/${r.id}`}>
                              <Button variant="ghost" size="icon" title="Editar" className="w-8 h-8">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </Link>
                          </Can>
                          <Can permission={PERMISSIONS.EXCHANGE_RATES.TOGGLE_ACTIVE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={r.isActive ? 'Deshabilitar' : 'Habilitar'}
                              onClick={() => setToggleTarget(r)}
                              disabled={actionLoading}
                              className="w-8 h-8"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </Can>
                          <Can
                            anyOf={[
                              PERMISSIONS.EXCHANGE_RATES.SOFT_DELETE,
                              PERMISSIONS.EXCHANGE_RATES.HARD_DELETE,
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
                                setDeleteTarget(r);
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
          itemLabel="tasas"
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
        title={toggleTarget?.isActive ? '¿Deshabilitar tasa?' : '¿Habilitar tasa?'}
        description={
          toggleTarget ? (
            <>
              La tasa <strong>{toggleTarget.currency}</strong> del{' '}
              {new Date(toggleTarget.effectiveDate).toLocaleString('es-VE')} cambiará de estado.
            </>
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
        title="¿Restaurar tasa?"
        description={
          restoreTarget ? (
            <>
              La tasa <strong>{restoreTarget.currency}</strong> del{' '}
              {new Date(restoreTarget.effectiveDate).toLocaleString('es-VE')} volverá a estar disponible.
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
            title="¿Eliminar tasa?"
            description={
              deleteTarget ? (
                <>
                  Vas a eliminar la tasa <strong>{deleteTarget.currency}</strong> del{' '}
                  {new Date(deleteTarget.effectiveDate).toLocaleString('es-VE')}.
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
                Esta acción es irreversible. Confirma de nuevo para eliminar permanentemente.
              </DialogBanner>
            </div>
          ) : null}
          <AlertDialogFooter className="px-6 pb-5 pt-2 flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={actionLoading} className="sm:mr-auto">
              Cancelar
            </AlertDialogCancel>
            <Can permission={PERMISSIONS.EXCHANGE_RATES.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.EXCHANGE_RATES.HARD_DELETE}>
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

      <ExchangeRateDetail
        rateId={viewTargetId}
        open={!!viewTargetId}
        onOpenChange={(o) => {
          if (!o) setViewTargetId(null);
        }}
      />
    </div>
  );
}
