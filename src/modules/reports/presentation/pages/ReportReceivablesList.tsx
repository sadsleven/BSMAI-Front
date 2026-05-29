import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Coins, TrendingUp, AlertCircle, Wallet } from 'lucide-react';
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
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import {
  STATUS_LABEL,
  type AccountsReceivable,
  type AccountsReceivableStatus,
  collectedBs,
  targetBs,
  pendingBs,
} from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import {
  holderDisplayId,
  holderDisplayName,
  type Order,
} from '@/modules/orders/domain/models/order';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import {
  formatBs,
  formatDate,
  formatNumber,
  inDateRange,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

const STATUS_TONE: Record<AccountsReceivableStatus, string> = {
  collected: 'bg-success-soft text-success',
  uncollected: 'bg-warning-soft text-warning',
  partially_collected: 'bg-brand-cyan-soft text-brand-blue-strong',
  overcollected: 'bg-brand-blue-soft text-brand-blue-strong',
};

const COLUMNS = 13;

export function ReportReceivablesList() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      insuranceId: sp.get('insuranceId') ?? '',
      status: (sp.get('status') ?? '') as '' | AccountsReceivableStatus,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<AccountsReceivable[]>([]);
  const [ordersIdx, setOrdersIdx] = useState<Record<string, Order>>({});
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInsurances(await insuranceGateway.listAssignable());
      } catch {
        if (!cancelled) setInsurances([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsReceivableGateway.list({
        limit: REPORT_PAGE_SIZE,
        page: 1,
        insuranceId: filters.insuranceId || undefined,
        status: filters.status || undefined,
        sortDir: 'DESC',
        sortBy: 'createdAt',
      }),
      orderGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([arRes, orderRes]) => {
        if (cancelled) return;
        setRows(arRes.data);
        setOverCap(
          arRes.metadata.total > REPORT_PAGE_SIZE ||
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
  }, [filters.insuranceId, filters.status]);

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
    !!filters.search || !!filters.from || !!filters.to || !!filters.insuranceId || !!filters.status;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const enriched = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows
      .map((ar) => ({ ar, order: ordersIdx[ar.orderId] ?? ar.order }))
      .filter(({ ar, order }) => {
        if (!inDateRange(ar.createdAt, filters.from || undefined, filters.to || undefined))
          return false;
        if (!s) return true;
        const blob = [
          ar.receivableNumber,
          ar.insurance?.name,
          order?.orderNumber,
          holderDisplayName(order?.holder),
          holderDisplayName(order?.patient),
          holderDisplayId(order?.holder),
          holderDisplayId(order?.patient),
          order?.serviceKey,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(s);
      });
  }, [rows, ordersIdx, filters.search, filters.from, filters.to]);

  const totals = useMemo(() => {
    let target = 0;
    let collected = 0;
    let pending = 0;
    enriched.forEach(({ ar }) => {
      const t = targetBs(ar) ?? 0;
      const c = collectedBs(ar);
      const p = pendingBs(ar) ?? Math.max(0, t - c);
      target += t;
      collected += c;
      pending += p;
    });
    return { target, collected, pending, count: enriched.length };
  }, [enriched]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return enriched.slice(start, start + filters.limit);
  }, [enriched, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(enriched.length / filters.limit));

  const doctorFromOrder = (o?: Order): string => {
    const d = o?.orderServiceTypes?.find((r) => r.providerType === 'doctor')?.doctor;
    if (!d) return '—';
    return `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || '—';
  };

  return (
    <ReportShell
      title="Reporte de cuentas por cobrar"
      description={`${formatNumber(enriched.length)} cuenta${enriched.length === 1 ? '' : 's'} en el rango filtrado`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Wallet,
              tone: 'blue',
              label: 'Total facturado',
              value: formatBs(totals.target),
              hint: 'Convertido a Bs por tasa de facturación',
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Total cobrado',
              value: formatBs(totals.collected),
              hint: `${totals.target > 0 ? ((totals.collected / totals.target) * 100).toFixed(1) : '0.0'}% de cobranza`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente por cobrar',
              value: formatBs(totals.pending),
            },
            {
              icon: Coins,
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
          searchPlaceholder="Buscar por aseguradora, titular, paciente, N° orden…"
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
                value={filters.insuranceId || 'all'}
                onValueChange={(v) =>
                  updateParam({ insuranceId: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Aseguradora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Aseguradora: todas</SelectItem>
                  {insurances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
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
                  <SelectItem value="uncollected">{STATUS_LABEL.uncollected}</SelectItem>
                  <SelectItem value="partially_collected">{STATUS_LABEL.partially_collected}</SelectItem>
                  <SelectItem value="collected">{STATUS_LABEL.collected}</SelectItem>
                  <SelectItem value="overcollected">{STATUS_LABEL.overcollected}</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Aseguradora</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Titular</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Médico</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Cuenta</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Clave</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Tasa Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Cobrado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={COLUMNS + 1} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS + 1} className="p-0">
                  <EmptyState
                    icon={Coins}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cuentas por cobrar'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han generado cuentas por cobrar de aseguradoras.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map(({ ar, order }) => {
                const t = targetBs(ar);
                const c = collectedBs(ar);
                const p = pendingBs(ar);
                const rate = order?.billingExchangeRate
                  ? Number(order.billingExchangeRate.amountBs)
                  : null;
                return (
                  <TableRow key={ar.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(ar.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      {ar.insurance?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <div className="font-medium truncate">{holderDisplayName(order?.holder)}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {holderDisplayId(order?.holder) || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <div className="font-medium truncate">{holderDisplayName(order?.patient)}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {holderDisplayId(order?.patient) || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">{doctorFromOrder(order)}</TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {order?.orderNumber ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {ar.receivableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-muted-foreground">
                      {order?.serviceKey ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {order
                        ? `${order.priceCurrency} ${Number(order.priceAmount).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {rate !== null ? rate.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(t)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatBs(c)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatBs(p)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_TONE[ar.status]} border-transparent`}
                      >
                        {STATUS_LABEL[ar.status]}
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
