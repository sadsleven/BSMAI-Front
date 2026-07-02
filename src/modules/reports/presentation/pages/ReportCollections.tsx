import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownCircle, TrendingUp, Banknote, ListChecks } from 'lucide-react';
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
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import { formatMoney } from '@/lib/format/money';
import {
  reportsGateway,
  type ReportCollectionRow,
  type ReportFlowSummary,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

const COLUMNS = 8;

const EMPTY_SUMMARY: ReportFlowSummary = { count: 0, totalUsd: 0, totalBs: 0 };

export function ReportCollections() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      type: (sp.get('type') ?? '') as '' | OrderPaymentType,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [items, setItems] = useState<ReportCollectionRow[]>([]);
  const [summary, setSummary] = useState<ReportFlowSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.collections({
          from: filters.from || undefined,
          to: filters.to || undefined,
          search: filters.search || undefined,
        });
        if (cancelled) return;
        setItems(res.rows);
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
  }, [filters.from, filters.to, filters.search]);

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
    return items.filter((it) => !filters.type || it.type === filters.type);
  }, [items, filters.type]);

  const topMethod = useMemo(() => {
    const byType = new Map<string, number>();
    filtered.forEach((it) => byType.set(it.type, (byType.get(it.type) ?? 0) + it.amountInUsd));
    const top = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])[0];
    return top
      ? { label: PAYMENT_TYPE_LABEL[top[0] as OrderPaymentType] ?? top[0], amount: top[1] }
      : { label: '—', amount: 0 };
  }, [filtered]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return filtered.slice(start, start + filters.limit);
  }, [filtered, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / filters.limit));

  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.type;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Cobros recibidos"
      description="Pagos registrados desde aseguradoras y titulares (cuentas por cobrar)"
      kpis={
        <KpiRow
          items={[
            {
              icon: ArrowDownCircle,
              tone: 'success',
              label: 'Total cobrado (USD)',
              value: formatUsd(summary.totalUsd),
              hint: formatBs(summary.totalBs),
            },
            {
              icon: ListChecks,
              tone: 'blue',
              label: 'Cobros registrados',
              value: formatNumber(summary.count),
            },
            {
              icon: Banknote,
              tone: 'cyan',
              label: 'Método principal',
              value: topMethod.label,
              hint: topMethod.amount ? formatUsd(topMethod.amount) : undefined,
            },
            {
              icon: TrendingUp,
              tone: 'warning',
              label: 'Promedio por cobro (USD)',
              value: summary.count > 0 ? formatUsd(summary.totalUsd / summary.count) : '—',
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por deudor, referencia, N° lote…"
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
                onValueChange={(v) => updateParam({ type: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Método: todos</SelectItem>
                  {Object.entries(PAYMENT_TYPE_LABEL).map(([k, v]) => (
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Deudor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Lote</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Método</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Referencia</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={COLUMNS} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="p-0">
                  <EmptyState
                    icon={ArrowDownCircle}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cobros registrados'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han registrado cobros.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((it) => (
                <TableRow key={it.paymentId} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4 text-sm whitespace-nowrap">
                    {formatDate(it.paymentDate)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-medium">
                    <div>{it.debtorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.debtorType === 'insurance' ? 'Seguro' : 'Titular'}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {it.receivableNumber}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm">
                    <Badge variant="outline" className="text-xs font-normal">
                      {PAYMENT_TYPE_LABEL[it.type as OrderPaymentType] ?? it.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {it.referenceNumber ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {it.amountCurrency} {formatMoney(it.amountValue)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatUsd(it.amountInUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatBs(it.amountInBs)}
                  </TableCell>
                </TableRow>
              ))
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
          itemLabel="cobros"
        />
        </div>
      </div>
    </ReportShell>
  );
}
