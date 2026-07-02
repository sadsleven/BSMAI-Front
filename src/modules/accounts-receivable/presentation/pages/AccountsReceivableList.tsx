import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HandCoins, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { formatCreated } from '@/lib/dates';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import {
  debtorDisplayName,
  debtorTypeOf,
  pendingBatchKey,
  pendingDebtorId,
  pendingDebtorName,
  pendingDebtorTypeLabel,
  STATUS_LABEL,
  type AccountsReceivableBatch,
  type AccountsReceivableDebtorType,
  type AccountsReceivableStatus,
  type PendingReceivable,
} from '../../domain/models/accountsReceivable';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';

type Tab = 'pending' | 'batches';
type SortBy = 'receivableNumber' | 'createdAt' | 'updatedAt';

function statusBadge(status: AccountsReceivableStatus) {
  const map: Record<AccountsReceivableStatus, { bg: string; dot: string }> = {
    collected: { bg: 'bg-success-soft text-success', dot: 'bg-success' },
    partially_collected: {
      bg: 'bg-brand-cyan-soft text-brand-blue-strong',
      dot: 'bg-brand-cyan',
    },
    overcollected: {
      bg: 'bg-brand-blue-soft text-brand-blue-strong',
      dot: 'bg-brand-blue',
    },
    uncollected: { bg: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  };
  const c = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} px-2 py-0.5 text-xs font-medium`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AccountsReceivableList() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const tab = (sp.get('tab') === 'batches' ? 'batches' : 'pending') as Tab;

  const [searchInput, setSearchInput] = useState(sp.get('search') ?? '');
  const [insurances, setInsurances] = useState<Insurance[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setInsurances(await insuranceGateway.listAssignable());
      } catch {
        setInsurances([]);
      }
    })();
  }, []);

  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 10) || 10,
      search: sp.get('search') ?? '',
      status: (sp.get('status') ?? '') as '' | AccountsReceivableStatus,
      debtorType: (sp.get('debtorType') ?? '') as '' | AccountsReceivableDebtorType,
      insuranceId: sp.get('insuranceId') ?? '',
      sortBy: (sp.get('sortBy') ?? 'createdAt') as SortBy,
      sortDir: (sp.get('sortDir') ?? 'DESC') as SortDir,
    }),
    [sp],
  );

  const updateParam = useCallback(
    (patch: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === null) next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in patch)) next.set('page', '1');
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) updateParam({ search: searchInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const setTab = (next: Tab) => {
    const params = new URLSearchParams();
    params.set('tab', next);
    setSp(params, { replace: true });
    setSearchInput('');
  };

  const hasActiveFilters = !!(
    filters.search ||
    filters.status ||
    filters.debtorType ||
    filters.insuranceId
  );
  const clearFilters = () => {
    setSearchInput('');
    const params = new URLSearchParams();
    params.set('tab', tab);
    setSp(params, { replace: true });
  };

  // -------- Pendientes --------
  const [pending, setPending] = useState<PendingReceivable[]>([]);
  const [pendingMeta, setPendingMeta] = useState({ total: 0, page: 1, lastPage: 1 });
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await accountsReceivableGateway.listPending({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        debtorType: filters.debtorType || undefined,
        insuranceId: filters.insuranceId || undefined,
      });
      setPending(res.data);
      setPendingMeta(res.metadata);
    } catch (e) {
      setPendingError(getHttpErrorMessage(e, 'No se pudieron cargar los pendientes'));
    } finally {
      setPendingLoading(false);
    }
  }, [filters]);

  // -------- Lotes --------
  const [batches, setBatches] = useState<AccountsReceivableBatch[]>([]);
  const [batchesMeta, setBatchesMeta] = useState({ total: 0, page: 1, lastPage: 1 });
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await accountsReceivableGateway.list({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        status: filters.status || undefined,
        debtorType: filters.debtorType || undefined,
        insuranceId: filters.insuranceId || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      setBatches(res.data);
      setBatchesMeta(res.metadata);
    } catch (e) {
      setBatchesError(getHttpErrorMessage(e, 'No se pudieron cargar los lotes'));
    } finally {
      setBatchesLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void Promise.resolve().then(() =>
      tab === 'pending' ? fetchPending() : fetchBatches(),
    );
  }, [tab, fetchPending, fetchBatches]);

  const onSort = (column: SortBy, dir: SortDir) =>
    updateParam({ sortBy: column, sortDir: dir });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedRows = useMemo(
    () => pending.filter((p) => selected.has(p.orderId)),
    [pending, selected],
  );

  // Mismo deudor y mismo modo (tasa fija vs USD) para todos los seleccionados.
  // Excepción: las órdenes cashea agrupan juntas aunque los titulares difieran
  // (el deudor del lote es Cashea).
  const sharedDebtor = useMemo(() => {
    if (selectedRows.length === 0) return null;
    const first = selectedRows[0];
    const key = pendingBatchKey(first);
    const allSame = selectedRows.every((r) => pendingBatchKey(r) === key);
    if (!allSame) return null;
    return {
      debtorType: first.debtorType,
      debtorId: pendingDebtorId(first),
      debtorName:
        first.debtorType === 'cashea' ? 'Cashea' : pendingDebtorName(first),
      useFixedRate: first.useFixedRate,
    };
  }, [selectedRows]);

  const canCreate = selectedRows.length >= 1 && sharedDebtor !== null;

  const goCreate = () => {
    if (canCreate && sharedDebtor) {
      navigate('/accounts-receivable/new', {
        state: {
          debtorType: sharedDebtor.debtorType,
          debtorId: sharedDebtor.debtorId,
          debtorName: sharedDebtor.debtorName,
          useFixedRate: sharedDebtor.useFixedRate,
          orderIds: selectedRows.map((r) => r.orderId),
        },
      });
      return;
    }
    navigate('/accounts-receivable/new');
  };

  const debtorFilters = (
    <>
      <Select
        value={filters.debtorType || 'all'}
        onValueChange={(v) =>
          updateParam({ debtorType: v === 'all' ? undefined : v })
        }
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Deudor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Deudor: todos</SelectItem>
          <SelectItem value="insurance">Seguro</SelectItem>
          <SelectItem value="holder">Titular (crédito)</SelectItem>
          <SelectItem value="cashea">Cashea</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.insuranceId || 'all'}
        onValueChange={(v) =>
          updateParam({ insuranceId: v === 'all' ? undefined : v })
        }
      >
        <SelectTrigger className="h-9 w-56">
          <SelectValue placeholder="Seguro" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Seguro: todos</SelectItem>
          {insurances.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  const pendingTargetLabel = (p: PendingReceivable) =>
    p.useFixedRate && p.targetBs !== null
      ? `${formatMoney(p.targetBs)} Bs.`
      : p.targetUsd !== null
        ? `${formatMoney(p.targetUsd)} USD`
        : '—';

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="space-y-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
          Cuentas por cobrar
        </h1>
        <p className="text-sm text-muted-foreground">
          Arma lotes de cobro por deudor desde las órdenes pendientes y registra
          los cobros.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="batches">Lotes</TabsTrigger>
        </TabsList>

        {/* ---------------- Pendientes ---------------- */}
        <TabsContent value="pending">
          <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
            <DataTableToolbar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Buscar por N° orden o deudor…"
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              filters={debtorFilters}
              actions={
                <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.CREATE}>
                  <Button
                    size="lg"
                    onClick={goCreate}
                    disabled={selectedRows.length > 0 && !canCreate}
                    className="bg-brand-blue text-white shadow-sm hover:bg-brand-blue-strong font-semibold"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Realizar cobro
                    {selectedRows.length > 0 && (
                      <span className="ml-1 text-[11px] opacity-80">
                        ({selectedRows.length})
                      </span>
                    )}
                  </Button>
                </Can>
              }
            />
            {selectedRows.length > 0 && !sharedDebtor ? (
              <div className="mx-4 mt-3 rounded-lg border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
                Las órdenes seleccionadas tienen deudores o modos de cobro
                distintos. Un lote agrupa órdenes de un solo seguro o de un solo
                titular (crédito), y de un mismo modo (tasa fija o USD). Sólo
                las órdenes Cashea pueden mezclar titulares.
              </div>
            ) : null}
            {pendingError ? (
              <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
                {pendingError}
              </div>
            ) : null}

            <div className="m-4 rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      N° orden
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Deudor
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Sucursal
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      A cobrar
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Creación
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLoading ? (
                    <SkeletonTableRows rows={5} columns={6} />
                  ) : pending.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={HandCoins}
                          title={
                            hasActiveFilters
                              ? 'Sin resultados con esos filtros'
                              : 'No hay órdenes pendientes de cobro'
                          }
                          description={
                            hasActiveFilters
                              ? 'Limpia los filtros para ver todas las órdenes.'
                              : 'Las órdenes finalizadas con deudor (seguro o titular) aparecen aquí hasta que se incluyen en un lote.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    pending.map((p) => (
                      <TableRow key={p.orderId} className="hover:bg-muted/30">
                        <TableCell className="py-3.5 px-4">
                          <Checkbox
                            checked={selected.has(p.orderId)}
                            onCheckedChange={() => toggleSelect(p.orderId)}
                            aria-label="Seleccionar orden"
                          />
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                          {p.orderNumber}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={
                                p.debtorType === 'holder'
                                  ? 'bg-brand-cyan-soft text-brand-blue-strong border-brand-cyan/40'
                                  : p.debtorType === 'cashea'
                                    ? 'bg-warning-soft text-warning border-warning/40'
                                    : 'bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30'
                              }
                            >
                              {pendingDebtorTypeLabel(p)}
                            </Badge>
                            {p.useFixedRate ? (
                              <Badge
                                variant="outline"
                                className="bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30"
                              >
                                Tasa fija
                              </Badge>
                            ) : null}
                            <span className="truncate">{pendingDebtorName(p)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                          {p.branchName ?? '—'}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm font-mono">
                          {pendingTargetLabel(p)}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                          {formatCreated(p.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <DataTablePagination
                page={filters.page}
                pageSize={filters.limit}
                total={pendingMeta.total}
                lastPage={pendingMeta.lastPage}
                onPageChange={(p) => updateParam({ page: p })}
                onPageSizeChange={(limit) => updateParam({ limit })}
                itemLabel="órdenes"
              />
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Lotes ---------------- */}
        <TabsContent value="batches">
          <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
            <DataTableToolbar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Buscar por N° lote, orden o deudor…"
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
                      <SelectItem value="uncollected">No cobrado</SelectItem>
                      <SelectItem value="partially_collected">
                        Cobrado parcialmente
                      </SelectItem>
                      <SelectItem value="collected">Cobrado</SelectItem>
                      <SelectItem value="overcollected">Sobre-cobrado</SelectItem>
                    </SelectContent>
                  </Select>
                  {debtorFilters}
                </>
              }
            />
            {batchesError ? (
              <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
                {batchesError}
              </div>
            ) : null}

            <div className="m-4 rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <SortableHeader<SortBy>
                        column="receivableNumber"
                        activeColumn={filters.sortBy}
                        direction={filters.sortDir}
                        onSort={onSort}
                      >
                        N° lote
                      </SortableHeader>
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Deudor
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Órdenes
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      A cobrar
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cobrado
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Falta
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Estado
                    </TableHead>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesLoading ? (
                    <SkeletonTableRows rows={5} columns={8} />
                  ) : batches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState
                          icon={HandCoins}
                          title={
                            hasActiveFilters
                              ? 'Sin resultados con esos filtros'
                              : 'Sin lotes de cobro'
                          }
                          description={
                            hasActiveFilters
                              ? 'Limpia los filtros para ver todos los lotes.'
                              : 'Realiza un cobro desde la pestaña Pendientes.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    batches.map((b) => {
                      const fixed = b.mode === 'fixed';
                      const unit = fixed ? 'Bs.' : 'USD';
                      const target = fixed ? b.targetBs ?? 0 : b.targetUsd ?? 0;
                      const collected = fixed ? b.collectedBs ?? 0 : b.collectedUsd ?? 0;
                      const pendingVal = fixed ? b.pendingBs ?? 0 : b.pendingUsd ?? 0;
                      const dt = debtorTypeOf(b);
                      return (
                        <TableRow
                          key={b.id}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => navigate(`/accounts-receivable/${b.id}`)}
                        >
                          <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                            {b.receivableNumber}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={
                                  dt === 'holder'
                                    ? 'bg-brand-cyan-soft text-brand-blue-strong border-brand-cyan/40'
                                    : dt === 'cashea'
                                      ? 'bg-warning-soft text-warning border-warning/40'
                                      : 'bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30'
                                }
                              >
                                {dt === 'holder'
                                  ? 'Titular'
                                  : dt === 'cashea'
                                    ? 'Cashea'
                                    : 'Seguro'}
                              </Badge>
                              {fixed ? (
                                <Badge
                                  variant="outline"
                                  className="bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30"
                                >
                                  Tasa fija
                                </Badge>
                              ) : null}
                              <span className="truncate">{debtorDisplayName(b)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                            {b.orders?.length ?? 0}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm font-mono">
                            {formatMoney(target)} {unit}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm font-mono">
                            {formatMoney(collected)} {unit}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm font-mono">
                            <span
                              className={
                                Math.abs(pendingVal) <= 0.01
                                  ? 'text-success'
                                  : pendingVal < 0
                                    ? 'text-brand-blue-strong'
                                    : collected > 0
                                      ? 'text-warning'
                                      : 'text-foreground'
                              }
                            >
                              {pendingVal < 0 ? '+' : ''}
                              {formatMoney(Math.abs(pendingVal))} {unit}
                            </span>
                          </TableCell>
                          <TableCell className="py-3.5 px-4">
                            {statusBadge(b.status)}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                            {formatCreated(b.createdAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <DataTablePagination
                page={filters.page}
                pageSize={filters.limit}
                total={batchesMeta.total}
                lastPage={batchesMeta.lastPage}
                onPageChange={(p) => updateParam({ page: p })}
                onPageSizeChange={(limit) => updateParam({ limit })}
                itemLabel="lotes"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
