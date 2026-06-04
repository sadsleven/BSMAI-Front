import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, TrendingUp, AlertCircle, Wallet } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import {
  EFFECTIVE_STATUS_LABEL,
  type AccountsPayable,
  type AccountsPayableStatus,
  amountToReceiveUsd,
  effectiveStatus,
  paidUsd,
  pendingUsd,
  recipientName,
} from '@/modules/accounts-payable/domain/models/accountsPayable';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import { holderDisplayName, type Order } from '@/modules/orders/domain/models/order';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import { fullName as doctorFullName, type Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatDate, formatNumber, inDateRange } from '../../domain/format';
import { useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-success-soft text-success',
  unpaid: 'bg-warning-soft text-warning',
  partially_paid: 'bg-brand-cyan-soft text-brand-blue-strong',
  undefined: 'bg-muted text-muted-foreground',
};

const COLUMNS = 15;

export function ReportPayablesList() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      doctorId: sp.get('doctorId') ?? '',
      careCenterId: sp.get('careCenterId') ?? '',
      status: (sp.get('status') ?? '') as '' | AccountsPayableStatus,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<AccountsPayable[]>([]);
  const [ordersIdx, setOrdersIdx] = useState<Record<string, Order>>({});
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [careCenters, setCareCenters] = useState<CareCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsPayableGateway.list({
        limit: REPORT_PAGE_SIZE,
        page: 1,
        doctorId: filters.doctorId || undefined,
        careCenterId: filters.careCenterId || undefined,
        status: filters.status || undefined,
        sortDir: 'DESC',
        sortBy: 'createdAt',
      }),
      orderGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([apRes, orderRes]) => {
        if (cancelled) return;
        setRows(apRes.data);
        setOverCap(
          apRes.metadata.total > REPORT_PAGE_SIZE ||
            orderRes.metadata.total > REPORT_PAGE_SIZE,
        );
        const idx: Record<string, Order> = {};
        orderRes.data.forEach((o) => {
          idx[o.id] = o;
        });
        setOrdersIdx(idx);
      })
      .catch((e) => {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.doctorId, filters.careCenterId, filters.status]);

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

  const hasActiveFilters =
    !!filters.search ||
    !!filters.from ||
    !!filters.to ||
    !!filters.doctorId ||
    !!filters.careCenterId ||
    !!filters.status;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const enriched = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows
      .map((ap) => ({ ap, order: ordersIdx[ap.orderId] ?? ap.order }))
      .filter(({ ap, order }) => {
        if (!inDateRange(ap.createdAt, filters.from || undefined, filters.to || undefined))
          return false;
        if (!s) return true;
        const blob = [
          ap.payableNumber,
          order?.orderNumber,
          recipientName(ap),
          holderDisplayName(order?.patient),
          order?.insurance?.name,
          order?.orderServiceTypes?.map((r) => r.serviceType?.name).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(s);
      });
  }, [rows, ordersIdx, filters.search, filters.from, filters.to]);

  const totals = useMemo(() => {
    let target = 0;
    let paid = 0;
    let pending = 0;
    enriched.forEach(({ ap }) => {
      const t = amountToReceiveUsd(ap) ?? 0;
      const p = paidUsd(ap);
      const pen = pendingUsd(ap) ?? Math.max(0, t - p);
      target += t;
      paid += p;
      pending += pen;
    });
    return { target, paid, pending, count: enriched.length };
  }, [enriched]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return enriched.slice(start, start + filters.limit);
  }, [enriched, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(enriched.length / filters.limit));

  const procedureFromOrder = (o?: Order): string => {
    const list = o?.orderServiceTypes?.map((r) => r.serviceType?.name).filter(Boolean) ?? [];
    if (list.length === 0) return '—';
    if (list.length === 1) return list[0]!;
    return `${list[0]} +${list.length - 1}`;
  };

  return (
    <ReportShell
      title="Reporte de cuentas por pagar"
      description={`${formatNumber(enriched.length)} cuenta${enriched.length === 1 ? '' : 's'} en el rango filtrado`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Wallet,
              tone: 'blue',
              label: 'Total a pagar',
              value: formatUsd(totals.target),
              hint: 'Tras retenciones',
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Total pagado',
              value: formatUsd(totals.paid),
              hint: `${totals.target > 0 ? ((totals.paid / totals.target) * 100).toFixed(1) : '0.0'}% de avance`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente por pagar',
              value: formatUsd(totals.pending),
            },
            {
              icon: Banknote,
              tone: 'cyan',
              label: 'Cantidad de cuentas',
              value: formatNumber(totals.count),
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} registros. Aplicá filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por proveedor, paciente, orden, servicio…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <DateRangeFilter
                from={filters.from || undefined}
                to={filters.to || undefined}
                onChange={(f, t) => updateParam({ from: f, to: t })}
              />
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
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) =>
                  updateParam({ status: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todos</SelectItem>
                  <SelectItem value="unpaid">{EFFECTIVE_STATUS_LABEL.unpaid}</SelectItem>
                  <SelectItem value="partially_paid">
                    {EFFECTIVE_STATUS_LABEL.partially_paid}
                  </SelectItem>
                  <SelectItem value="paid">{EFFECTIVE_STATUS_LABEL.paid}</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Proveedor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Cuenta</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Seguro</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Procedimiento</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Facturación</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">A recibir</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pagado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pagado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pago</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={COLUMNS} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="p-0">
                  <EmptyState
                    icon={Banknote}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cuentas por pagar'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han generado cuentas por pagar a proveedores.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map(({ ap, order }) => {
                const ar = amountToReceiveUsd(ap);
                const paid = paidUsd(ap);
                const pend = pendingUsd(ap);
                const eff = effectiveStatus(ap);
                const lastPayment = (ap.payments ?? []).slice().sort((a, b) => {
                  return (
                    new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
                  );
                })[0];
                return (
                  <TableRow key={ap.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(ap.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      <div>{recipientName(ap)}</div>
                      <div className="text-xs text-muted-foreground">
                        {ap.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {holderDisplayName(order?.patient)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {order?.orderNumber ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {ap.payableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground truncate max-w-[160px]">
                      {order?.insurance?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm truncate max-w-[200px]">
                      {procedureFromOrder(order)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {order ? `USD ${Number(order.priceAmount).toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {ar !== null ? `USD ${ar.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatUsd(paid)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatBs(usdToBs(paid, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatUsd(pend)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatBs(usdToBs(pend, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {lastPayment ? (
                        <div className="min-w-0">
                          <div className="text-muted-foreground whitespace-nowrap">
                            {formatDate(lastPayment.paymentDate)}
                          </div>
                          <div className="text-xs font-mono truncate max-w-[120px]">
                            {lastPayment.referenceNumber ?? '—'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_TONE[eff]} border-transparent`}
                      >
                        {EFFECTIVE_STATUS_LABEL[eff]}
                      </Badge>
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
          total={enriched.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="cuentas"
        />
      </div>
    </ReportShell>
  );
}
