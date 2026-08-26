import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { ConfirmDialog, DialogIconHeader, DialogBanner } from '@/components/ui/confirm-dialog';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { formatCreatedDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  Plus,
  Trash2,
  Eye,
  Undo2,
  ListChecks,
  FileText,
  FileEdit,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { useOrderStore } from '../../domain/store/orderStore';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  type Order,
  type OrderStatus,
  type OrderType,
  holderDisplayName,
  isOrderCancelled,
  orderInternalNumbers,
  orderUserDisplayName,
} from '../../domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getUserBranches } from '@/lib/auth/branches';
import { cn } from '@/lib/utils';
import { lastAccessibleStep } from '../../domain/wizardStep';
import { OrderCancelModal } from '../components/OrderCancelModal';

type SortBy = 'orderNumber' | 'orderDate' | 'appointmentDate' | 'priceAmount' | 'createdAt' | 'updatedAt';
type DeletionFilter = 'active' | 'deleted' | 'all';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') as OrderStatus | '') || '',
    type: (sp.get('type') as OrderType | '') || '',
    branchId: sp.get('branchId') ?? '',
    deletion: (sp.get('deletion') as DeletionFilter) ?? 'active',
    sortBy: (sp.get('sortBy') as SortBy) ?? 'createdAt',
    sortDir: ((sp.get('sortDir') as SortDir) ?? 'DESC') as SortDir,
  };
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-brand-blue-soft text-brand-blue-strong',
  attended: 'bg-warning-soft text-warning',
  report_issued: 'bg-warning-soft text-warning',
  finalized: 'bg-success-soft text-success',
  cancelled: 'bg-destructive-soft text-destructive',
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        STATUS_COLOR[status],
      )}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

// Estado visto por el usuario proveedor: su propia observación (Paso 3), no el
// estado global de la orden. Completa = campo libre lleno (archivos opcionales).
function ProviderObservationBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        complete ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
      )}
    >
      {complete ? 'Observación completada' : 'Observación pendiente'}
    </span>
  );
}

export function OrderList() {
  const { orders, metadata, isLoading, error, setQuery, fetch, remove } = useOrderStore();
  const { has } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);

  const branches = useMemo(() => getUserBranches(me), [me]);
  const canSeeDeleted = has(PERMISSIONS.ORDERS.HARD_DELETE) || has(PERMISSIONS.ORDERS.RESTORE);
  // Usuario proveedor: oculta montos/sucursal y muestra sólo el acceso al informe.
  const isProvider = !!me?.providerLink;
  const colCount = isProvider ? 8 : 10;

  useEffect(() => {
    setQuery({
      page: filters.page,
      limit: filters.limit,
      search: filters.search || undefined,
      status: (filters.status || undefined) as OrderStatus | undefined,
      type: (filters.type || undefined) as OrderType | undefined,
      branchId: filters.branchId || undefined,
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

  const filteredDeletion: DeletionFilter = canSeeDeleted ? filters.deletion : 'active';

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.status) ||
    Boolean(filters.type) ||
    Boolean(filters.branchId) ||
    filters.deletion !== 'active';

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [hardConfirmStep, setHardConfirmStep] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await orderGateway.softDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Orden movida a la papelera');
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
      await orderGateway.hardDelete(deleteTarget.id);
      remove(deleteTarget.id);
      notify.success('Orden eliminada permanentemente');
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
      await orderGateway.restore(restoreTarget.id);
      notify.success('Orden restaurada');
      setRestoreTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo restaurar.');
    } finally {
      setActionLoading(false);
    }
  };

  const providerOf = (o: Order): string => {
    const rows = o.orderServiceTypes ?? [];
    if (rows.length === 0) return '—';
    const names = new Set<string>();
    for (const r of rows) {
      if (r.providerType === 'doctor' && r.doctor) {
        names.add(`${r.doctor.firstName ?? ''} ${r.doctor.lastName ?? ''}`.trim());
      } else if (r.providerType === 'care_center' && r.careCenter) {
        names.add(r.careCenter.businessName ?? '');
      }
    }
    if (names.size === 0) return '—';
    if (names.size === 1) return [...names][0];
    return `${names.size} proveedores`;
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">Órdenes</h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} órdenes en total
          </p>
        </div>
        <Can permission={PERMISSIONS.ORDERS.CREATE}>
          <div className="flex items-center gap-2">
            <Link to="/orders/drafts">
              <Button variant="outline">
                <FileEdit className="w-4 h-4 mr-1.5" />
                Borradores
              </Button>
            </Link>
            <Link to="/orders/create">
              <Button>
                <Plus className="w-4 h-4 mr-1.5" />
                Nueva orden
              </Button>
            </Link>
          </div>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por número, cédula o nombre…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => updateParam({ status: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todos</SelectItem>
                  {(
                    [
                      'draft',
                      'in_progress',
                      'attended',
                      'report_issued',
                      'finalized',
                      'cancelled',
                    ] as OrderStatus[]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.type || 'all'}
                onValueChange={(v) => updateParam({ type: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  {(['cash', 'credit', 'insurance', 'cashea'] as OrderType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ORDER_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!isProvider ? (
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
              ) : null}

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
            <TableRow className="bg-brand-blue-soft hover:bg-brand-blue-soft">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="orderNumber"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  N° orden
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="orderDate"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Fecha
                </SortableHeader>
              </TableHead>
              {!isProvider ? (
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Creado por
                </TableHead>
              ) : null}
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Tipo
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Titular / Paciente
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Estado
              </TableHead>
              {!isProvider ? (
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
              ) : null}
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="createdAt"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Creación
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTableRows rows={5} columns={colCount} />
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0">
                  <EmptyState
                    title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay órdenes'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Crea la primera orden para empezar.'
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
              orders.map((order) => {
                const isDeleted = !!order.deletedAt;
                const isCancelled = isOrderCancelled(order);
                return (
                  <TableRow key={order.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 font-mono text-sm">
                      {(() => {
                        const nums = orderInternalNumbers(order);
                        return (
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="font-semibold">{nums[0]}</span>
                            {nums.slice(1).map((n) => (
                              <span key={n} className="text-muted-foreground">
                                · {n}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {order.orderDate.slice(0, 10)}
                    </TableCell>
                    {!isProvider ? (
                      <TableCell className="py-3.5 px-4 text-sm">
                        {orderUserDisplayName(order.createdBy)}
                      </TableCell>
                    ) : null}
                    <TableCell className="py-3.5 px-4">
                      <Badge variant="secondary">
                        {ORDER_TYPE_LABEL[order.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <div className="text-sm font-medium">
                        {holderDisplayName(order.holder)}
                      </div>
                      {order.patientId !== order.holderId ? (
                        <div className="text-xs text-muted-foreground">
                          → {holderDisplayName(order.patient)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">{providerOf(order)}</TableCell>
                    <TableCell className="py-3.5 px-4">
                      {isProvider ? (
                        <ProviderObservationBadge
                          complete={!!order.providerObservationComplete}
                        />
                      ) : (
                        <StatusBadge status={order.status} />
                      )}
                    </TableCell>
                    {!isProvider ? (
                      <TableCell className="py-3.5 px-4 text-sm font-mono">
                        {formatMoney(order.priceAmount)} USD
                      </TableCell>
                    ) : null}
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCreatedDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-center gap-0.5">
                        {isProvider ? (
                          <Link to={`/orders/edit/${order.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cargar informe"
                              className="w-8 h-8"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </Link>
                        ) : (
                          <>
                        <Can permission={PERMISSIONS.ORDERS.LIST}>
                          <Link to={`/orders/${order.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ver detalle"
                              className="w-8 h-8"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        </Can>
                        <Can permission={PERMISSIONS.ORDERS.UPDATE}>
                          {isCancelled ? (
                            // Orden cancelada: el flujo queda congelado hasta
                            // reactivarla (el BE también lo bloquea).
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Orden cancelada: reactívala para continuar el flujo"
                              className="w-8 h-8"
                              disabled
                            >
                              <ListChecks className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Link
                              to={`/orders/edit/${order.id}?step=${lastAccessibleStep(order, {
                                attention: has(PERMISSIONS.ORDERS.STAGE_ATTENTION),
                                report: has(PERMISSIONS.ORDERS.STAGE_REPORT),
                                billing: has(PERMISSIONS.ORDERS.STAGE_BILLING),
                              })}`}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Continuar flujo (atención / informe / facturación)"
                                className="w-8 h-8"
                              >
                                <ListChecks className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                        </Can>
                        {!isDeleted && order.status !== 'finalized' ? (
                          <Can permission={PERMISSIONS.ORDERS.CANCEL}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'w-8 h-8',
                                isCancelled
                                  ? 'text-success hover:bg-success-soft hover:text-success'
                                  : 'text-destructive hover:bg-destructive-soft hover:text-destructive',
                              )}
                              title={
                                isCancelled
                                  ? 'Reactivar orden (revertir cancelación)'
                                  : 'Cancelar orden (conserva el número)'
                              }
                              onClick={() => setCancelTarget(order)}
                              disabled={actionLoading}
                            >
                              {isCancelled ? (
                                <RotateCcw className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </Button>
                          </Can>
                        ) : null}
                        {isDeleted ? (
                          <Can permission={PERMISSIONS.ORDERS.RESTORE}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Restaurar"
                              className="w-8 h-8"
                              onClick={() => setRestoreTarget(order)}
                              disabled={actionLoading}
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can
                              anyOf={[
                                PERMISSIONS.ORDERS.SOFT_DELETE,
                                PERMISSIONS.ORDERS.HARD_DELETE,
                              ]}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-destructive hover:bg-destructive-soft hover:text-destructive"
                                title="Eliminar"
                                onClick={() => {
                                  setDeleteTarget(order);
                                  setHardConfirmStep(0);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </Can>
                          </>
                        )}
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
          itemLabel="órdenes"
        />
        </div>
      </div>

      <OrderCancelModal
        key={cancelTarget?.id ?? 'none'}
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        order={cancelTarget}
        onDone={() => {
          setCancelTarget(null);
          void fetch();
        }}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => {
          if (!o) setRestoreTarget(null);
        }}
        tone="success"
        icon={Undo2}
        title="¿Restaurar orden?"
        description="La orden volverá a estar disponible con su estado anterior."
        confirmLabel="Restaurar"
        loading={actionLoading}
        onConfirm={confirmRestore}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setHardConfirmStep(0);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[460px] rounded-xl gap-4 p-0">
          <DialogIconHeader
            tone="destructive"
            icon={Trash2}
            title="¿Eliminar orden?"
            description="Elige entre mover a la papelera (reversible) o eliminar permanentemente."
            onClose={() => {
              setDeleteTarget(null);
              setHardConfirmStep(0);
            }}
          />
          {hardConfirmStep === 1 ? (
            <div className="px-6">
              <DialogBanner tone="destructive">
                Esta acción es irreversible. Confirma de nuevo.
              </DialogBanner>
            </div>
          ) : null}
          <AlertDialogFooter className="px-6 pb-5 pt-2 flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={actionLoading} className="sm:mr-auto">
              Cancelar
            </AlertDialogCancel>
            <Can permission={PERMISSIONS.ORDERS.SOFT_DELETE}>
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
            <Can permission={PERMISSIONS.ORDERS.HARD_DELETE}>
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
