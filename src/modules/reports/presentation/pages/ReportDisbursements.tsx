import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpCircle, TrendingUp, Banknote, Receipt } from 'lucide-react';
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
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { taxesPayableGateway } from '@/modules/taxes-payable/infrastructure/taxesPayableGateway';
import { recipientName as apRecipientName } from '@/modules/accounts-payable/domain/models/accountsPayable';
import { recipientName as taxRecipientName } from '@/modules/taxes-payable/domain/models/taxesPayable';
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

type DestKind = 'provider' | 'tax';

type DisbursementRow = {
  id: string;
  paymentDate: string;
  type: OrderPaymentType;
  referenceNumber: string | null | undefined;
  bankCode: string | null | undefined;
  amountValue: number;
  amountCurrency: 'USD' | 'EUR' | 'BS';
  amountInBs: number;
  destination: string;
  accountNumber: string;
  kind: DestKind;
};

export function ReportDisbursements() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      type: (sp.get('type') ?? '') as '' | OrderPaymentType,
      kind: (sp.get('kind') ?? '') as '' | DestKind,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [items, setItems] = useState<DisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      taxesPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([apRes, taxRes]) => {
        if (cancelled) return;
        setOverCap(
          apRes.metadata.total > REPORT_PAGE_SIZE ||
            taxRes.metadata.total > REPORT_PAGE_SIZE,
        );
        const flat: DisbursementRow[] = [];
        apRes.data.forEach((ap) => {
          (ap.payments ?? []).forEach((p) => {
            flat.push({
              id: `ap-${p.id}`,
              paymentDate: p.paymentDate,
              type: p.type,
              referenceNumber: p.referenceNumber,
              bankCode: p.bankCode,
              amountValue: Number(p.amountValue ?? 0),
              amountCurrency: p.amountCurrency,
              amountInBs: Number(p.amountInBs ?? 0),
              destination: apRecipientName(ap),
              accountNumber: ap.payableNumber,
              kind: 'provider',
            });
          });
        });
        taxRes.data.forEach((t) => {
          (t.payments ?? []).forEach((p) => {
            flat.push({
              id: `tax-${p.id}`,
              paymentDate: p.paymentDate,
              type: p.type,
              referenceNumber: p.referenceNumber,
              bankCode: p.bankCode,
              amountValue: Number(p.amountValue ?? 0),
              amountCurrency: p.amountCurrency,
              amountInBs: Number(p.amountInBs ?? 0),
              destination: `Retención · ${taxRecipientName(t)}`,
              accountNumber: t.taxPayableNumber,
              kind: 'tax',
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
        if (filters.kind && it.kind !== filters.kind) return false;
        if (!s) return true;
        return [it.destination, it.referenceNumber, it.bankCode, it.accountNumber]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(s);
      })
      .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
  }, [items, filters.search, filters.from, filters.to, filters.type, filters.kind]);

  const totals = useMemo(() => {
    let total = 0;
    let provider = 0;
    let tax = 0;
    filtered.forEach((it) => {
      total += it.amountInBs;
      if (it.kind === 'provider') provider += it.amountInBs;
      else tax += it.amountInBs;
    });
    return { total, provider, tax, count: filtered.length };
  }, [filtered]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return filtered.slice(start, start + filters.limit);
  }, [filtered, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / filters.limit));

  const hasActiveFilters =
    !!filters.search ||
    !!filters.from ||
    !!filters.to ||
    !!filters.type ||
    !!filters.kind;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Pagos emitidos"
      description="Salidas registradas a proveedores y al fisco (impuestos retenidos)"
      kpis={
        <KpiRow
          items={[
            {
              icon: ArrowUpCircle,
              tone: 'destructive',
              label: 'Total egresos',
              value: formatBs(totals.total),
              hint: `${formatNumber(totals.count)} pagos`,
            },
            {
              icon: Banknote,
              tone: 'blue',
              label: 'A proveedores',
              value: formatBs(totals.provider),
            },
            {
              icon: Receipt,
              tone: 'warning',
              label: 'A impuestos',
              value: formatBs(totals.tax),
            },
            {
              icon: TrendingUp,
              tone: 'cyan',
              label: 'Promedio por pago',
              value: totals.count > 0 ? formatBs(totals.total / totals.count) : '—',
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando pagos de hasta {REPORT_PAGE_SIZE} cuentas por lado. Aplicá filtros para acotar.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por destinatario, referencia, banco…"
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
                value={filters.kind || 'all'}
                onValueChange={(v) =>
                  updateParam({ kind: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Concepto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Concepto: todos</SelectItem>
                  <SelectItem value="provider">A proveedores</SelectItem>
                  <SelectItem value="tax">A impuestos</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.type || 'all'}
                onValueChange={(v) =>
                  updateParam({ type: v === 'all' ? undefined : v })
                }
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Destinatario</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Cuenta</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Concepto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Método</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Banco</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Referencia</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={9} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={ArrowUpCircle}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin pagos emitidos'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han registrado pagos a proveedores ni al fisco.'
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
                    {it.destination}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {it.accountNumber}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm">
                    <Badge
                      variant="outline"
                      className={`text-xs font-normal border-transparent ${it.kind === 'tax' ? 'bg-warning-soft text-warning' : 'bg-brand-blue-soft text-brand-blue-strong'}`}
                    >
                      {it.kind === 'tax' ? 'Impuesto' : 'Proveedor'}
                    </Badge>
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
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-destructive">
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
          itemLabel="pagos"
        />
      </div>
    </ReportShell>
  );
}
