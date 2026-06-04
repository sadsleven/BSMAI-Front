import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Workflow,
  CheckCircle2,
  XCircle,
  Clock,
  FileSearch,
  type LucideIcon,
} from 'lucide-react';
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
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  holderDisplayName,
  type Order,
  type OrderStatus,
  type OrderType,
} from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow, type KpiTone } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import {
  formatUsd,
  formatDate,
  formatNumber,
  daysBetween,
  inDateRange,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

const STATUS_ORDER: OrderStatus[] = [
  'draft',
  'in_progress',
  'attended',
  'report_issued',
  'finalized',
  'cancelled',
];

const STATUS_META: Record<
  OrderStatus,
  { tone: KpiTone; icon: LucideIcon; badge: string }
> = {
  draft: { tone: 'neutral', icon: FileSearch, badge: 'bg-muted text-muted-foreground' },
  in_progress: { tone: 'cyan', icon: Clock, badge: 'bg-brand-cyan-soft text-brand-blue-strong' },
  attended: { tone: 'blue', icon: Workflow, badge: 'bg-brand-blue-soft text-brand-blue-strong' },
  report_issued: { tone: 'warning', icon: Workflow, badge: 'bg-warning-soft text-warning' },
  finalized: { tone: 'success', icon: CheckCircle2, badge: 'bg-success-soft text-success' },
  cancelled: { tone: 'destructive', icon: XCircle, badge: 'bg-destructive-soft text-destructive' },
};

export function ReportOrdersPipeline() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      status: (sp.get('status') ?? '') as '' | OrderStatus,
      type: (sp.get('type') ?? '') as '' | OrderType,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    orderGateway
      .list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setOverCap(res.metadata.total > REPORT_PAGE_SIZE);
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
  }, []);

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

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows.filter((o) => {
      if (!inDateRange(o.orderDate, filters.from || undefined, filters.to || undefined))
        return false;
      if (filters.status && o.status !== filters.status) return false;
      if (filters.type && o.type !== filters.type) return false;
      if (!s) return true;
      return [
        o.orderNumber,
        holderDisplayName(o.holder),
        holderDisplayName(o.patient),
        o.insurance?.name,
        o.specialty?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(s);
    });
  }, [rows, filters.search, filters.from, filters.to, filters.status, filters.type]);

  const byStatus = useMemo(() => {
    const counts: Record<OrderStatus, { count: number; amountBs: number }> = {
      draft: { count: 0, amountBs: 0 },
      in_progress: { count: 0, amountBs: 0 },
      attended: { count: 0, amountBs: 0 },
      report_issued: { count: 0, amountBs: 0 },
      finalized: { count: 0, amountBs: 0 },
      cancelled: { count: 0, amountBs: 0 },
    };
    filtered.forEach((o) => {
      counts[o.status].count += 1;
      const rate = o.billingExchangeRate ? Number(o.billingExchangeRate.amountBs) : 0;
      const amount = Number(o.priceAmount) || 0;
      counts[o.status].amountBs += rate > 0 ? amount * rate : 0;
    });
    return counts;
  }, [filtered]);

  const top4 = STATUS_ORDER.filter((s) => s !== 'cancelled').slice(0, 4);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return filtered.slice(start, start + filters.limit);
  }, [filtered, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / filters.limit));

  const hasActiveFilters =
    !!filters.search ||
    !!filters.from ||
    !!filters.to ||
    !!filters.status ||
    !!filters.type;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Seguimiento de órdenes"
      description="Distribución de órdenes por etapa del flujo y tiempo en cada estado"
      kpis={
        <KpiRow
          items={top4.map((st) => ({
            icon: STATUS_META[st].icon,
            tone: STATUS_META[st].tone,
            label: ORDER_STATUS_LABEL[st],
            value: formatNumber(byStatus[st].count),
            hint: byStatus[st].amountBs > 0 ? formatUsd(byStatus[st].amountBs) : undefined,
          }))}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} órdenes. Aplicá filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N° orden, paciente, titular…"
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
                  {STATUS_ORDER.map((s) => (
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
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  {Object.entries(ORDER_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Especialidad</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Estado</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Días en sistema</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={8} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={Workflow}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin órdenes'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han creado órdenes en el sistema.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((o) => {
                const meta = STATUS_META[o.status];
                const days = daysBetween(o.orderDate);
                return (
                  <TableRow key={o.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm font-mono font-semibold">
                      <Link
                        to={`/orders/edit/${o.id}`}
                        className="text-brand-blue hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(o.orderDate)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {holderDisplayName(o.patient)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {o.specialty?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <Badge variant="outline" className="text-xs font-normal">
                        {ORDER_TYPE_LABEL[o.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs font-normal border-transparent ${meta.badge}`}
                      >
                        {ORDER_STATUS_LABEL[o.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(days)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      USD {Number(o.priceAmount).toFixed(2)}
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
          total={filtered.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="órdenes"
        />
      </div>
    </ReportShell>
  );
}
