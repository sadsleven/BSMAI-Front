import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TaxesPayableDetail } from '../components/TaxesPayableDetail';
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
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { formatCreated } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { taxesPayableGateway } from '../../infrastructure/taxesPayableGateway';
import {
  canSelectForPayment,
  pendingBs,
  recipientName,
  STATUS_LABEL,
  taxAmountBs,
  type TaxPayable,
  type TaxPayableStatus,
} from '../../domain/models/taxesPayable';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import {
  fullName as doctorFullName,
  type Doctor,
} from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';

type SortBy = 'taxPayableNumber' | 'taxAmountBs' | 'grossAmountBs' | 'createdAt' | 'updatedAt';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') ?? '') as '' | TaxPayableStatus,
    doctorId: sp.get('doctorId') ?? '',
    careCenterId: sp.get('careCenterId') ?? '',
    sortBy: (sp.get('sortBy') ?? 'createdAt') as SortBy,
    sortDir: (sp.get('sortDir') ?? 'DESC') as SortDir,
  };
}

function formatBs(n: number): string {
  return formatMoney(n);
}

export function TaxesPayableList() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);

  const [data, setData] = useState<TaxPayable[]>([]);
  const [metadata, setMetadata] = useState({ total: 0, page: 1, lastPage: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
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

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await taxesPayableGateway.list({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        status: filters.status || undefined,
        doctorId: filters.doctorId || undefined,
        careCenterId: filters.careCenterId || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      setData(res.data);
      setMetadata(res.metadata);
    } catch (e) {
      setError(getHttpErrorMessage(e, 'No se pudieron cargar las cuentas'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const onSort = (column: SortBy, dir: SortDir) =>
    updateParam({ sortBy: column, sortDir: dir });

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters = !!(
    filters.search ||
    filters.status ||
    filters.doctorId ||
    filters.careCenterId
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedAccounts = useMemo(
    () => data.filter((a) => selected.has(a.id)),
    [data, selected],
  );

  const goRegister = () => {
    if (selectedAccounts.length === 0) {
      notify.warning('Seleccioná al menos una cuenta');
      return;
    }
    navigate('/taxes-payable/register-payment', {
      state: { taxPayableIds: selectedAccounts.map((a) => a.id) },
    });
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Retenciones por pagar
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} cuenta{metadata.total === 1 ? '' : 's'} en total
          </p>
        </div>
        <Can permission={PERMISSIONS.TAXES_PAYABLE.UPDATE}>
          <Button onClick={goRegister} disabled={selectedAccounts.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" />
            Registrar pago al SENIAT
            {selectedAccounts.length > 0 && (
              <span className="ml-1 text-[11px] opacity-80">
                ({selectedAccounts.length})
              </span>
            )}
          </Button>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N° comprobante u orden…"
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
                  <SelectItem value="partially_paid">Pagado parcialmente</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.doctorId || 'all'}
                onValueChange={(v) =>
                  updateParam({ doctorId: v === 'all' ? undefined : v })
                }
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
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="taxPayableNumber"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  N° comprobante
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Órdenes
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Proveedor
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Régimen
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="grossAmountBs"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Bruto (Bs.)
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="taxAmountBs"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Retención (Bs.)
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Falta (Bs.)
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={5} columns={11} />
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <EmptyState
                    icon={Receipt}
                    title={
                      hasActiveFilters
                        ? 'Sin resultados con esos filtros'
                        : 'Sin Retenciones por pagar'
                    }
                    description={
                      hasActiveFilters
                        ? 'Limpiá los filtros para ver todas las cuentas.'
                        : 'Los comprobantes se generan al registrar un pago a doctor/centro en Cuentas por pagar.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              data.map((a) => {
                const taxBs = taxAmountBs(a);
                const grossBs = Number(a.grossAmountBs) || 0;
                const pBs = pendingBs(a);
                const selectable = canSelectForPayment(a);
                const ratePct = a.taxRate ? (Number(a.taxRate) * 100).toFixed(0) : null;
                const orders = a.orders ?? [];
                return (
                  <TableRow key={a.id} className="hover:bg-muted/30">
                    <TableCell className="py-3.5 px-4">
                      <Checkbox
                        checked={selected.has(a.id)}
                        disabled={!selectable}
                        onCheckedChange={() => selectable && toggleSelect(a.id)}
                        aria-label="Seleccionar cuenta"
                      />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                      {a.taxPayableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-xs">
                      {orders.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : orders.length <= 3 ? (
                        <div className="flex flex-wrap gap-1">
                          {orders.map((o) => (
                            <Link
                              key={o.id}
                              to={`/orders/edit/${o.id}`}
                              className="font-mono text-brand-blue hover:underline"
                            >
                              {o.orderNumber}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span>
                          <span className="font-mono">{orders[0].orderNumber}</span>{' '}
                          <span className="text-muted-foreground">
                            +{orders.length - 1} más
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <div>{recipientName(a)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge variant="outline" className="font-normal text-[10px]">
                        {a.personType === 'legal_entity' ? 'PJD' : 'PNR'}
                        {ratePct ? ` · ${ratePct}%` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {formatBs(grossBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {formatBs(taxBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      <span
                        className={
                          pBs <= 0.01
                            ? 'text-success'
                            : pBs < taxBs
                              ? 'text-warning'
                              : 'text-foreground'
                        }
                      >
                        {formatBs(pBs)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <span
                        className={
                          a.status === 'paid'
                            ? 'inline-flex items-center gap-1.5 rounded-full bg-success-soft text-success px-2 py-0.5 text-xs font-medium'
                            : a.status === 'partially_paid'
                              ? 'inline-flex items-center gap-1.5 rounded-full bg-brand-cyan-soft text-brand-blue-strong px-2 py-0.5 text-xs font-medium'
                              : 'inline-flex items-center gap-1.5 rounded-full bg-warning-soft text-warning px-2 py-0.5 text-xs font-medium'
                        }
                      >
                        <span
                          className={
                            a.status === 'paid'
                              ? 'w-1.5 h-1.5 rounded-full bg-success'
                              : a.status === 'partially_paid'
                                ? 'w-1.5 h-1.5 rounded-full bg-brand-cyan'
                                : 'w-1.5 h-1.5 rounded-full bg-warning'
                          }
                        />
                        {STATUS_LABEL[a.status]}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCreated(a.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetailId(a.id)}
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <TaxesPayableDetail
          taxPayableId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
        />

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={metadata.total}
          lastPage={metadata.lastPage}
          onPageChange={(p) => updateParam({ page: p })}
          onPageSizeChange={(limit) => updateParam({ limit })}
          itemLabel="cuentas"
        />
      </div>
    </div>
  );
}
