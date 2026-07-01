import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PieChart, TrendingUp, Activity, Sigma } from 'lucide-react';
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
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import {
  ORDER_TYPE_LABEL,
  type Order,
  type OrderType,
} from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import {
  formatUsd,
  formatNumber,
  formatPercent,
  inDateRange,
} from '../../domain/format';
import { formatBs } from '../../domain/format';
import { useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type Row = {
  serviceTypeId: string;
  name: string;
  uses: number;
  ordersCount: number;
  estimatedUsd: number;
};

export function ReportServicesBilled() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      type: (sp.get('type') ?? '') as '' | OrderType,
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();

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
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const aggregated = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const orderSet = new Map<string, Set<string>>();
    rows.forEach((o) => {
      if (!inDateRange(o.orderDate, filters.from || undefined, filters.to || undefined)) return;
      if (filters.type && o.type !== filters.type) return;
      const sts = o.orderServiceTypes ?? [];
      if (sts.length === 0) return;
      const perSt = Number(o.priceAmount) / sts.length;
      sts.forEach((row) => {
        const id = row.serviceTypeId;
        const name = row.serviceType?.name ?? '—';
        let r = map.get(id);
        if (!r) {
          r = { serviceTypeId: id, name, uses: 0, ordersCount: 0, estimatedUsd: 0 };
          map.set(id, r);
        }
        r.uses += 1;
        r.estimatedUsd += perSt;
        if (!orderSet.has(id)) orderSet.set(id, new Set());
        orderSet.get(id)!.add(o.id);
      });
    });
    map.forEach((r) => {
      r.ordersCount = orderSet.get(r.serviceTypeId)?.size ?? 0;
    });
    const result = Array.from(map.values());
    const s = filters.search.toLowerCase().trim();
    const filtered = s ? result.filter((r) => r.name.toLowerCase().includes(s)) : result;
    return filtered.sort((a, b) => b.uses - a.uses);
  }, [rows, filters.from, filters.to, filters.type, filters.search]);

  const totals = useMemo(() => {
    let uses = 0;
    let est = 0;
    aggregated.forEach((r) => {
      uses += r.uses;
      est += r.estimatedUsd;
    });
    return { uses, est, top: aggregated[0] };
  }, [aggregated]);

  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.type;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Servicios facturados"
      description="Demanda y revenue estimado por tipo de servicio — monto distribuido equitativamente entre los servicios de cada orden"
      kpis={
        <KpiRow
          items={[
            {
              icon: PieChart,
              tone: 'blue',
              label: 'Servicios distintos',
              value: formatNumber(aggregated.length),
            },
            {
              icon: Activity,
              tone: 'cyan',
              label: 'Total realizaciones',
              value: formatNumber(totals.uses),
            },
            {
              icon: Sigma,
              tone: 'success',
              label: 'Revenue estimado',
              value: formatUsd(totals.est),
            },
            {
              icon: TrendingUp,
              tone: 'warning',
              label: 'Servicio top',
              value: totals.top ? totals.top.name : '—',
              hint: totals.top ? `${formatNumber(totals.top.uses)} usos` : undefined,
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} órdenes. Aplica filtros para acotar.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar servicio…"
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
                value={filters.type || 'all'}
                onValueChange={(v) =>
                  updateParam({ type: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Tipo orden" />
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

        <div className="m-4 rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Servicio</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Realizaciones</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Órdenes distintas</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">% del volumen</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Revenue USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Revenue Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={7} />
            ) : aggregated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={PieChart}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin servicios registrados'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han facturado servicios en las órdenes.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              aggregated.map((r, idx) => {
                const pct = totals.uses > 0 ? (r.uses / totals.uses) * 100 : 0;
                return (
                  <TableRow key={r.serviceTypeId} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right font-semibold">
                      {formatNumber(r.uses)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(r.ordersCount)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatPercent(pct)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(r.estimatedUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(usdToBs(r.estimatedUsd, usdRate))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
