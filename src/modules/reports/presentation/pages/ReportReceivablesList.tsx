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
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type ReportReceivableRow,
  type ReportReceivableSummary,
  type ReceivableOrderState,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

const STATE_LABEL: Record<ReceivableOrderState, string> = {
  sin_lote: 'Por cobrar',
  uncollected: 'Por cobrar',
  partially_collected: 'Cobro parcial',
  collected: 'Cobrado',
  overcollected: 'Sobrecobrado',
};

const STATE_TONE: Record<ReceivableOrderState, string> = {
  sin_lote: 'bg-muted text-muted-foreground',
  uncollected: 'bg-warning-soft text-warning',
  partially_collected: 'bg-brand-cyan-soft text-brand-blue-strong',
  collected: 'bg-success-soft text-success',
  overcollected: 'bg-brand-blue-soft text-brand-blue-strong',
};

const COLUMNS = 8;

const EMPTY_SUMMARY: ReportReceivableSummary = {
  count: 0,
  targetUsd: 0,
  targetBs: 0,
  collectedUsd: 0,
  collectedBs: 0,
  pendingUsd: 0,
  pendingBs: 0,
};

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
      status: sp.get('status') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportReceivableRow[]>([]);
  const [summary, setSummary] = useState<ReportReceivableSummary>(EMPTY_SUMMARY);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.receivables({
          from: filters.from || undefined,
          to: filters.to || undefined,
          insuranceId: filters.insuranceId || undefined,
          status: filters.status || undefined,
          search: filters.search || undefined,
        });
        if (cancelled) return;
        setRows(res.rows);
        setSummary(res.summary);
      } catch (e) {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, filters.insuranceId, filters.status, filters.search]);

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

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return rows.slice(start, start + filters.limit);
  }, [rows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(rows.length / filters.limit));

  const pct = summary.targetUsd > 0 ? (summary.collectedUsd / summary.targetUsd) * 100 : 0;

  return (
    <ReportShell
      title="Reporte de cuentas por cobrar"
      description={`${formatNumber(summary.count)} orden${summary.count === 1 ? '' : 'es'} en el rango filtrado`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Wallet,
              tone: 'blue',
              label: 'Total facturado',
              value: formatUsd(summary.targetUsd),
              hint: summary.targetBs > 0 ? `${formatBs(summary.targetBs)} a tasa fija` : 'USD',
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Total cobrado',
              value: formatUsd(summary.collectedUsd),
              hint: `${pct.toFixed(1)}% de cobranza (USD)`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente por cobrar',
              value: formatUsd(summary.pendingUsd),
              hint:
                summary.pendingBs > 0
                  ? `+ ${formatBs(summary.pendingBs)} (tasa fija) · incluye por cobrar`
                  : 'Incluye órdenes por cobrar',
            },
            {
              icon: Coins,
              tone: 'cyan',
              label: 'Cantidad de órdenes',
              value: formatNumber(summary.count),
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por aseguradora, titular, N° orden…"
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
                  <SelectValue placeholder="Tipo de deudor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Deudor: todos</SelectItem>
                  <SelectItem value="insurance">Solo seguros</SelectItem>
                  <SelectItem value="holder">Solo titulares</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Deudor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Lote</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Modo</TableHead>
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
                    icon={Coins}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cuentas por cobrar'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no hay órdenes por cobrar.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => (
                <TableRow key={r.orderId} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(r.orderDate)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm">
                    <div className="font-medium truncate">{r.debtorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.debtorType === 'holder' ? 'Titular' : 'Seguro'}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {r.orderNumber}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {r.receivableNumber ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {r.targetUsd != null ? formatUsd(r.targetUsd) : '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {r.targetBs != null ? formatBs(r.targetBs) : '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm">
                    <Badge variant="outline" className="text-xs font-normal">
                      {r.useFixedRate ? 'Tasa fija (Bs)' : 'USD'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATE_TONE[r.state]} border-transparent`}
                    >
                      {STATE_LABEL[r.state]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={rows.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="órdenes"
        />
        </div>
      </div>
    </ReportShell>
  );
}
