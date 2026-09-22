import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
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
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import {
  pendingProviderId,
  pendingProviderName,
  recipientName,
  STATUS_LABEL,
  type AccountsPayableBatch,
  type AccountsPayableStatus,
  type PendingPayable,
} from '../../domain/models/accountsPayable';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import {
  fullName as doctorFullName,
  type Doctor,
} from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';

type Tab = 'pending' | 'batches';
type SortBy = 'payableNumber' | 'createdAt' | 'updatedAt';

function statusBadge(status: AccountsPayableStatus) {
  const map: Record<AccountsPayableStatus, { bg: string; dot: string }> = {
    paid: { bg: 'bg-success-soft text-success', dot: 'bg-success' },
    partially_paid: {
      bg: 'bg-brand-cyan-soft text-brand-blue-strong',
      dot: 'bg-brand-cyan',
    },
    unpaid: { bg: 'bg-warning-soft text-warning', dot: 'bg-warning' },
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

export function AccountsPayableList() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const tab = (sp.get('tab') === 'batches' ? 'batches' : 'pending') as Tab;

  const [searchInput, setSearchInput] = useState(sp.get('search') ?? '');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [careCenters, setCareCenters] = useState<CareCenter[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setDoctors(await doctorGateway.listAssignable());
      } catch {
        setDoctors([]);
      }
    })();
    (async () => {
      try {
        setCareCenters(await careCenterGateway.listAssignable());
      } catch {
        setCareCenters([]);
      }
    })();
  }, []);

  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 10) || 10,
      search: sp.get('search') ?? '',
      status: (sp.get('status') ?? '') as '' | AccountsPayableStatus,
      doctorId: sp.get('doctorId') ?? '',
      careCenterId: sp.get('careCenterId') ?? '',
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
    filters.doctorId ||
    filters.careCenterId
  );
  const clearFilters = () => {
    setSearchInput('');
    const params = new URLSearchParams();
    params.set('tab', tab);
    setSp(params, { replace: true });
  };

  // -------- Pendientes --------
  const [pending, setPending] = useState<PendingPayable[]>([]);
  const [pendingMeta, setPendingMeta] = useState({ total: 0, page: 1, lastPage: 1 });
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await accountsPayableGateway.listPending({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        doctorId: filters.doctorId || undefined,
        careCenterId: filters.careCenterId || undefined,
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
  const [batches, setBatches] = useState<AccountsPayableBatch[]>([]);
  const [batchesMeta, setBatchesMeta] = useState({ total: 0, page: 1, lastPage: 1 });
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await accountsPayableGateway.list({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        status: filters.status || undefined,
        doctorId: filters.doctorId || undefined,
        careCenterId: filters.careCenterId || undefined,
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
    () => pending.filter((p) => selected.has(p.internalOrderId)),
    [pending, selected],
  );

  // Mismo proveedor para todos los seleccionados.
  const sharedProvider = useMemo(() => {
    if (selectedRows.length === 0) return null;
    const first = selectedRows[0];
    const key = `${first.providerType}:${pendingProviderId(first)}`;
    const allSame = selectedRows.every(
      (r) => `${r.providerType}:${pendingProviderId(r)}` === key,
    );
    if (!allSame) return null;
    return {
      providerType: first.providerType,
      providerId: pendingProviderId(first) as string,
      providerName: pendingProviderName(first),
    };
  }, [selectedRows]);

  const canCreate = selectedRows.length >= 1 && sharedProvider !== null;

  const goCreate = () => {
    if (canCreate && sharedProvider) {
      navigate('/accounts-payable/new', {
        state: {
          recipientType: sharedProvider.providerType,
          providerId: sharedProvider.providerId,
          providerName: sharedProvider.providerName,
          internalOrderIds: selectedRows.map((r) => r.internalOrderId),
        },
      });
      return;
    }
    navigate('/accounts-payable/new');
  };

  const providerFilters = (
    <>
      <Select
        value={filters.doctorId || 'all'}
        onValueChange={(v) => updateParam({ doctorId: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-56">
          <SelectValue placeholder="Doctor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Doctor: todos</SelectItem>
          {doctors.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {doctorFullName(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.careCenterId || 'all'}
        onValueChange={(v) =>
          updateParam({ careCenterId: v === 'all' ? undefined : v })
        }
      >
        <SelectTrigger className="h-9 w-56">
          <SelectValue placeholder="Centro" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Centro: todos</SelectItem>
          {careCenters.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.businessName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="space-y-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
          Cuentas por pagar
        </h1>
        <p className="text-sm text-muted-foreground">
          Arma lotes de pago por proveedor desde las órdenes pendientes y
          registra los pagos.
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
              searchPlaceholder="Buscar por N° orden interna…"
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              filters={providerFilters}
              actions={
                <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.CREATE}>
                  <Button
                    size="lg"
                    onClick={goCreate}
                    disabled={selectedRows.length > 0 && !canCreate}
                    className="bg-brand-blue text-white shadow-sm hover:bg-brand-blue-strong font-semibold"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Realizar pago
                    {selectedRows.length > 0 && (
                      <span className="ml-1 text-[11px] opacity-80">
                        ({selectedRows.length})
                      </span>
                    )}
                  </Button>
                </Can>
              }
            />
            {selectedRows.length > 0 && !sharedProvider ? (
              <div className="mx-4 mt-3 rounded-lg border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
                Las órdenes seleccionadas son de proveedores distintos. Un lote
                agrupa órdenes de un solo doctor o de un solo centro.
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
                      N° orden interna
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Proveedor
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Tipo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Sucursal
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      TotalUSD
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Creación
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLoading ? (
                    <SkeletonTableRows rows={5} columns={7} />
                  ) : pending.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <EmptyState
                          icon={Wallet}
                          title={
                            hasActiveFilters
                              ? 'Sin resultados con esos filtros'
                              : 'No hay órdenes pendientes de pago'
                          }
                          description={
                            hasActiveFilters
                              ? 'Limpia los filtros para ver todas las órdenes.'
                              : 'Las órdenes finalizadas con monto al proveedor aparecen aquí hasta que se incluyen en un lote.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    pending.map((p) => (
                      <TableRow key={p.internalOrderId} className="hover:bg-muted/30">
                        <TableCell className="py-3.5 px-4">
                          <Checkbox
                            checked={selected.has(p.internalOrderId)}
                            onCheckedChange={() => toggleSelect(p.internalOrderId)}
                            aria-label="Seleccionar orden"
                          />
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                          {p.internalNumber}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm">
                          {pendingProviderName(p)}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm">
                          <Badge variant="outline" className="font-normal">
                            {p.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                          {p.branchName ?? '—'}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm font-mono">
                          {formatMoney(p.grossUsd)} USD
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
              searchPlaceholder="Buscar por N° lote u orden interna…"
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
                      <SelectItem value="unpaid">No pagado</SelectItem>
                      <SelectItem value="partially_paid">
                        Pagado parcialmente
                      </SelectItem>
                      <SelectItem value="paid">Pagado</SelectItem>
                    </SelectContent>
                  </Select>
                  {providerFilters}
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
                        column="payableNumber"
                        activeColumn={filters.sortBy}
                        direction={filters.sortDir}
                        onSort={onSort}
                      >
                        N° lote
                      </SortableHeader>
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Proveedor
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Órdenes
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      TotalUSD
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Neto Bs.
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Falta Bs.
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
                          icon={Wallet}
                          title={
                            hasActiveFilters
                              ? 'Sin resultados con esos filtros'
                              : 'Sin lotes de pago'
                          }
                          description={
                            hasActiveFilters
                              ? 'Limpia los filtros para ver todos los lotes.'
                              : 'Realiza un pago desde la pestaña Pendientes.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    batches.map((b) => (
                      <TableRow
                        key={b.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/accounts-payable/${b.id}`)}
                      >
                        <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                          {b.payableNumber}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm">
                          <div>{recipientName(b)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {b.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                          {b.orderCount ?? b.orders?.length ?? 0}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm font-mono">
                          {formatMoney(b.grossUsd ?? 0)} USD
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm font-mono">
                          {formatMoney(b.netBs ?? 0)} Bs.
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm font-mono">
                          <span
                            className={
                              (b.pendingBs ?? 0) <= 0.01
                                ? 'text-success'
                                : (b.paidBs ?? 0) > 0
                                  ? 'text-warning'
                                  : 'text-foreground'
                            }
                          >
                            {formatMoney(b.pendingBs ?? 0)} Bs.
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 px-4">
                          {statusBadge(b.status)}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                          {formatCreated(b.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
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
