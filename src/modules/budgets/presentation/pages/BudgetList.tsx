import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { formatDateOnly } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getUserBranches } from '@/lib/auth/branches';
import { holderDisplayName } from '@/modules/orders/domain/models/order';
import { useBudgetStore } from '../../domain/store/budgetStore';
import { budgetGateway } from '../../infrastructure/budgetGateway';
import {
  BUDGET_STATUS_LABEL,
  BUDGET_STATUS_ORDER,
  BUDGET_TYPE_LABEL,
  BUDGET_TYPE_ORDER,
  budgetIsEditable,
  type Budget,
  type BudgetStatus,
  type BudgetType,
} from '../../domain/models/budget';
import { BudgetExportMenu } from '../components/BudgetExportMenu';
import { BudgetStatusModal } from '../components/BudgetStatusModal';

type SortBy =
  | 'budgetNumber'
  | 'budgetDate'
  | 'validUntilDate'
  | 'priceAmount'
  | 'status'
  | 'createdAt';
type DeletionFilter = 'active' | 'deleted' | 'all';

const STATUS_COLOR: Record<BudgetStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-brand-blue-soft text-brand-blue-strong',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-destructive-soft text-destructive',
};

function StatusBadge({ budget }: { budget: Budget }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          STATUS_COLOR[budget.status],
        )}
      >
        {BUDGET_STATUS_LABEL[budget.status]}
      </span>
      {budget.expired ? (
        <span className="inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
          Vencido
        </span>
      ) : null}
      {budget.convertedOrder ? (
        <span className="inline-flex items-center rounded-full bg-brand-cyan-soft px-2 py-0.5 text-xs font-medium text-brand-cyan-strong">
          Orden N° {budget.convertedOrder.orderNumber}
        </span>
      ) : null}
    </div>
  );
}

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') as BudgetStatus | '') || '',
    type: (sp.get('type') as BudgetType | '') || '',
    branchId: sp.get('branchId') ?? '',
    converted: sp.get('converted') ?? '',
    deletion: (sp.get('deletion') as DeletionFilter) ?? 'active',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'budgetNumber',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

export function BudgetList() {
  const { budgets, metadata, isLoading, error, setQuery, fetch, remove, upsert } =
    useBudgetStore();
  const { has } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);
  const branches = useMemo(() => getUserBranches(me), [me]);
  const canSeeDeleted =
    has(PERMISSIONS.BUDGETS.HARD_DELETE) || has(PERMISSIONS.BUDGETS.RESTORE);

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
      status: (filters.status || undefined) as BudgetStatus | undefined,
      type: (filters.type || undefined) as BudgetType | undefined,
      branchId: filters.branchId || undefined,
      converted:
        filters.converted === '' ? undefined : filters.converted === 'true',
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
    filters.type,
    filters.branchId,
    filters.converted,
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

  const updateParam = (
    patch: Record<string, string | undefined>,
    resetPage = true,
  ) => {
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
    Boolean(filters.status) ||
    Boolean(filters.type) ||
    Boolean(filters.branchId) ||
    Boolean(filters.converted) ||
    filters.deletion !== 'active';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  // --- Acciones ---
  const [statusTarget, setStatusTarget] = useState<{
    budget: Budget;
    status: BudgetStatus;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [hardConfirmStep, setHardConfirmStep] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<Budget | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await budgetGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Presupuesto movido a la papelera');
      setDeleteTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar.');
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
      await budgetGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Presupuesto eliminado permanentemente');
      setDeleteTarget(null);
      setHardConfirmStep(0);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      setActionLoading(true);
      await budgetGateway.restore(restoreTarget.id);
      notify.success('Presupuesto restaurado');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar.');
    } finally {
      setActionLoading(false);
    }
  };

  const canHardDelete = has(PERMISSIONS.BUDGETS.HARD_DELETE);
  const colCount = 8;

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">
            Presupuestos
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} presupuestos en total
          </p>
        </div>
        <Can permission={PERMISSIONS.BUDGETS.CREATE}>
          <Link to="/budgets/create">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo presupuesto
            </Button>
          </Link>
        </Can>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N°, paciente, cédula o seguro…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) =>
                  updateParam({ status: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todos</SelectItem>
                  {BUDGET_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BUDGET_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.type || 'all'}
                onValueChange={(v) =>
                  updateParam({ type: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  {BUDGET_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BUDGET_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.converted || 'all'}
                onValueChange={(v) =>
                  updateParam({ converted: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Orden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Orden: todos</SelectItem>
                  <SelectItem value="true">Ya generó orden</SelectItem>
                  <SelectItem value="false">Sin orden</SelectItem>
                </SelectContent>
              </Select>

              {branches.length > 1 ? (
                <Select
                  value={filters.branchId || 'all'}
                  onValueChange={(v) =>
                    updateParam({ branchId: v === 'all' ? undefined : v })
                  }
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
              ) : null}

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
          <div className="border-b bg-destructive-soft px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="m-4 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-blue-soft hover:bg-brand-blue-soft">
                <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Acciones
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <SortableHeader<SortBy>
                    column="budgetNumber"
                    activeColumn={filters.sortBy}
                    direction={filters.sortDir}
                    onSort={onSort}
                  >
                    N°
                  </SortableHeader>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Paciente / Titular
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Tipo / Seguro
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <SortableHeader<SortBy>
                    column="priceAmount"
                    activeColumn={filters.sortBy}
                    direction={filters.sortDir}
                    onSort={onSort}
                  >
                    Monto
                  </SortableHeader>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <SortableHeader<SortBy>
                    column="budgetDate"
                    activeColumn={filters.sortBy}
                    direction={filters.sortDir}
                    onSort={onSort}
                  >
                    Fecha
                  </SortableHeader>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <SortableHeader<SortBy>
                    column="validUntilDate"
                    activeColumn={filters.sortBy}
                    direction={filters.sortDir}
                    onSort={onSort}
                  >
                    Válido hasta
                  </SortableHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonTableRows rows={filters.limit} columns={colCount} />
              ) : budgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-10">
                    <EmptyState
                      title="Sin presupuestos"
                      description={
                        hasActiveFilters
                          ? 'Ningún presupuesto coincide con los filtros.'
                          : 'Crea el primer presupuesto para empezar.'
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
                budgets.map((budget) => {
                  const isDeleted = !!budget.deletedAt;
                  const editable = budgetIsEditable(budget);
                  return (
                    <TableRow
                      key={budget.id}
                      className="hover:bg-[oklch(0.985_0.003_250)]"
                    >
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <Can permission={PERMISSIONS.BUDGETS.LIST}>
                            <Link to={`/budgets/${budget.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver detalle"
                                className="h-8 w-8"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </Can>
                          {!isDeleted ? (
                            <Can permission={PERMISSIONS.BUDGETS.LIST}>
                              <BudgetExportMenu
                                budget={budget}
                                variant="ghost"
                                size="icon"
                              />
                            </Can>
                          ) : null}
                          {!isDeleted && editable ? (
                            <Can permission={PERMISSIONS.BUDGETS.UPDATE}>
                              <Link to={`/budgets/edit/${budget.id}`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar"
                                  className="h-8 w-8"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                            </Can>
                          ) : null}
                          {!isDeleted && !budget.convertedOrderId ? (
                            <Can permission={PERMISSIONS.BUDGETS.CHANGE_STATUS}>
                              {budget.status === 'draft' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Marcar como enviado"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    setStatusTarget({ budget, status: 'sent' })
                                  }
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              ) : null}
                              {budget.status !== 'approved' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Marcar como aprobado"
                                  className="h-8 w-8 text-success hover:bg-success-soft hover:text-success"
                                  onClick={() =>
                                    setStatusTarget({ budget, status: 'approved' })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                              {budget.status !== 'rejected' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Marcar como rechazado"
                                  className="h-8 w-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                                  onClick={() =>
                                    setStatusTarget({ budget, status: 'rejected' })
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </Can>
                          ) : null}
                          {isDeleted ? (
                            <Can permission={PERMISSIONS.BUDGETS.RESTORE}>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Restaurar"
                                className="h-8 w-8"
                                onClick={() => setRestoreTarget(budget)}
                                disabled={actionLoading}
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            </Can>
                          ) : (
                            <Can
                              anyOf={[
                                PERMISSIONS.BUDGETS.SOFT_DELETE,
                                PERMISSIONS.BUDGETS.HARD_DELETE,
                              ]}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                                title="Eliminar"
                                onClick={() => {
                                  setDeleteTarget(budget);
                                  setHardConfirmStep(0);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Can>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 font-mono text-sm font-semibold">
                        {budget.budgetNumber}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">
                            {holderDisplayName(budget.patient)}
                          </div>
                          {budget.patientId !== budget.holderId ? (
                            <div className="text-xs text-muted-foreground">
                              Titular: {holderDisplayName(budget.holder)}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <div className="text-sm">
                            {BUDGET_TYPE_LABEL[budget.type]}
                          </div>
                          {budget.insurance ? (
                            <div className="text-xs text-muted-foreground">
                              {budget.insurance.shortName || budget.insurance.name}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <StatusBadge budget={budget} />
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm tabular-nums">
                        ${formatMoney(budget.priceAmount)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm">
                        {formatDateOnly(budget.budgetDate)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm">
                        {budget.validUntilDate
                          ? formatDateOnly(budget.validUntilDate)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination
          page={metadata.page}
          lastPage={metadata.lastPage}
          total={metadata.total}
          pageSize={filters.limit}
          onPageChange={onPage}
          onPageSizeChange={(size) => updateParam({ limit: String(size) })}
          itemLabel="presupuestos"
        />
      </div>

      <BudgetStatusModal
        key={`${statusTarget?.budget.id ?? 'none'}:${statusTarget?.status ?? ''}`}
        open={!!statusTarget}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        budget={statusTarget?.budget ?? null}
        target={statusTarget?.status ?? 'sent'}
        onDone={(updated) => {
          upsert(updated);
          setStatusTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        tone="info"
        icon={Undo2}
        title="Restaurar presupuesto"
        description={`¿Restaurar el presupuesto ${restoreTarget?.budgetNumber ?? ''}? Volverá al listado activo.`}
        confirmLabel="Restaurar"
        onConfirm={() => void confirmRestore()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setHardConfirmStep(0);
          }
        }}
        tone="destructive"
        icon={AlertTriangle}
        title={
          canHardDelete && hardConfirmStep > 0
            ? 'Eliminar permanentemente'
            : 'Eliminar presupuesto'
        }
        description={
          canHardDelete && hardConfirmStep > 0
            ? `El presupuesto ${deleteTarget?.budgetNumber ?? ''} se borra de forma definitiva y su número vuelve a quedar libre. Esta acción no se puede deshacer.`
            : `¿Mover el presupuesto ${deleteTarget?.budgetNumber ?? ''} a la papelera? Se puede restaurar después.`
        }
        confirmLabel={
          canHardDelete && hardConfirmStep > 0
            ? 'Eliminar definitivamente'
            : 'Mover a la papelera'
        }
        confirmVariant="destructive"
        onConfirm={() =>
          void (canHardDelete && hardConfirmStep > 0
            ? handleHardDelete()
            : handleSoftDelete())
        }
      />
    </div>
  );
}
