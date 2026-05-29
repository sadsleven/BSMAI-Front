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
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatBs, formatDate, formatNumber, inDateRange } from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type CollectionRow = {
  id: string;
  paymentDate: string;
  type: OrderPaymentType;
  referenceNumber: string | null | undefined;
  bankCode: string | null | undefined;
  amountValue: number;
  amountCurrency: 'USD' | 'EUR' | 'BS';
  amountInBs: number;
  insuranceName: string;
  receivableNumber: string;
};

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
  const [items, setItems] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    accountsReceivableGateway
      .list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' })
      .then((res) => {
        if (cancelled) return;
        setOverCap(res.metadata.total > REPORT_PAGE_SIZE);
        const flat: CollectionRow[] = [];
        res.data.forEach((ar) => {
          (ar.payments ?? []).forEach((p) => {
            flat.push({
              id: p.id,
              paymentDate: p.paymentDate,
              type: p.type,
              referenceNumber: p.referenceNumber,
              bankCode: p.bankCode,
              amountValue: Number(p.amountValue ?? 0),
              amountCurrency: p.amountCurrency,
              amountInBs: Number(p.amountInBs ?? 0),
              insuranceName: ar.insurance?.name ?? '—',
              receivableNumber: ar.receivableNumber,
            });
          });
        });
        setItems(flat);
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
    return items
      .filter((it) => {
        if (!inDateRange(it.paymentDate, filters.from || undefined, filters.to || undefined))
          return false;
        if (filters.type && it.type !== filters.type) return false;
        if (!s) return true;
        return [it.referenceNumber, it.bankCode, it.insuranceName, it.receivableNumber]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(s);
      })
      .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
  }, [items, filters.search, filters.from, filters.to, filters.type]);

  const totals = useMemo(() => {
    let bs = 0;
    let count = 0;
    const byType = new Map<OrderPaymentType, number>();
    filtered.forEach((it) => {
      bs += it.amountInBs;
      count += 1;
      byType.set(it.type, (byType.get(it.type) ?? 0) + it.amountInBs);
    });
    const top = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])[0];
    return { bs, count, topMethod: top ? PAYMENT_TYPE_LABEL[top[0]] : '—', topAmount: top?.[1] ?? 0 };
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
      description="Pagos registrados desde aseguradoras (cuentas por cobrar)"
      kpis={
        <KpiRow
          items={[
            {
              icon: ArrowDownCircle,
              tone: 'success',
              label: 'Total cobrado',
              value: formatBs(totals.bs),
            },
            {
              icon: ListChecks,
              tone: 'blue',
              label: 'Cobros registrados',
              value: formatNumber(totals.count),
            },
            {
              icon: Banknote,
              tone: 'cyan',
              label: 'Método principal',
              value: totals.topMethod,
              hint: totals.topAmount ? formatBs(totals.topAmount) : undefined,
            },
            {
              icon: TrendingUp,
              tone: 'warning',
              label: 'Promedio por cobro',
              value: totals.count > 0 ? formatBs(totals.bs / totals.count) : '—',
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando pagos de hasta {REPORT_PAGE_SIZE} cuentas. Aplicá filtros para acotar.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por aseguradora, referencia, banco…"
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

        <Table>
          <TableHeader>
            <TableRow className="bg-[oklch(0.985_0.003_250)] hover:bg-[oklch(0.985_0.003_250)]">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Aseguradora</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Cuenta</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Método</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Banco</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Referencia</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={8} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={ArrowDownCircle}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cobros registrados'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han registrado cobros de aseguradoras.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((it) => (
                <TableRow key={it.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4 text-sm whitespace-nowrap">
                    {formatDate(it.paymentDate)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-medium">
                    {it.insuranceName}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {it.receivableNumber}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm">
                    <Badge variant="outline" className="text-xs font-normal">
                      {PAYMENT_TYPE_LABEL[it.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-muted-foreground">
                    {it.bankCode ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {it.referenceNumber ?? '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {it.amountCurrency} {it.amountValue.toFixed(2)}
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
    </ReportShell>
  );
}
