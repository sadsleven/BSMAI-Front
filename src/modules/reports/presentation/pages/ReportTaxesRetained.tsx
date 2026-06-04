import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Receipt, AlertCircle, TrendingUp, Wallet } from 'lucide-react';
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
import { taxesPayableGateway } from '@/modules/taxes-payable/infrastructure/taxesPayableGateway';
import {
  paidBs,
  pendingBs,
  recipientName,
  STATUS_LABEL,
  taxAmountBs,
  type TaxPayable,
  type TaxPayableStatus,
} from '@/modules/taxes-payable/domain/models/taxesPayable';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import { holderDisplayName, type Order } from '@/modules/orders/domain/models/order';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { fullName as doctorFullName, type Doctor } from '@/modules/doctors/domain/models/doctor';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatDate, formatNumber, formatPercent, inDateRange } from '../../domain/format';
import { bsToUsd, useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

const STATUS_TONE: Record<TaxPayableStatus, string> = {
  paid: 'bg-success-soft text-success',
  unpaid: 'bg-warning-soft text-warning',
  partially_paid: 'bg-brand-cyan-soft text-brand-blue-strong',
};

const COLUMNS = 15;

export function ReportTaxesRetained() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      doctorId: sp.get('doctorId') ?? '',
      status: (sp.get('status') ?? '') as '' | TaxPayableStatus,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<TaxPayable[]>([]);
  const [ordersIdx, setOrdersIdx] = useState<Record<string, Order>>({});
  const [doctors, setDoctors] = useState<Doctor[]>([]);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      taxesPayableGateway.list({
        limit: REPORT_PAGE_SIZE,
        page: 1,
        doctorId: filters.doctorId || undefined,
        status: filters.status || undefined,
        sortDir: 'DESC',
        sortBy: 'createdAt',
      }),
      orderGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([taxRes, orderRes]) => {
        if (cancelled) return;
        setRows(taxRes.data);
        setOverCap(
          taxRes.metadata.total > REPORT_PAGE_SIZE ||
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
  }, [filters.doctorId, filters.status]);

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

  const enriched = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows
      .map((t) => {
        const firstOrderId = t.orders?.[0]?.id;
        const order = firstOrderId ? (ordersIdx[firstOrderId] ?? t.orders?.[0]) : t.orders?.[0];
        return { t, order };
      })
      .filter(({ t, order }) => {
        if (!inDateRange(t.createdAt, filters.from || undefined, filters.to || undefined))
          return false;
        if (!s) return true;
        const orderNums = (t.orders ?? []).map((o) => o.orderNumber).join(' ');
        const blob = [
          t.taxPayableNumber,
          orderNums,
          recipientName(t),
          holderDisplayName(order?.patient),
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
    let natural = 0;
    let legal = 0;
    enriched.forEach(({ t }) => {
      const tgUsd = bsToUsd(taxAmountBs(t), usdRate);
      const pUsd = bsToUsd(paidBs(t), usdRate);
      const penUsd = bsToUsd(pendingBs(t), usdRate);
      target += tgUsd;
      paid += pUsd;
      pending += penUsd;
      if (t.personType === 'legal_entity') legal += tgUsd;
      else natural += tgUsd;
    });
    return { target, paid, pending, natural, legal, count: enriched.length };
  }, [enriched, usdRate]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return enriched.slice(start, start + filters.limit);
  }, [enriched, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(enriched.length / filters.limit));

  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.doctorId || !!filters.status;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Reporte de impuestos retenidos"
      description={`${formatNumber(enriched.length)} retenci${enriched.length === 1 ? 'ón' : 'ones'} en el rango filtrado`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Receipt,
              tone: 'blue',
              label: 'Total retenido',
              value: formatUsd(totals.target),
              hint: `Natural ${formatUsd(totals.natural)} · Jurídico ${formatUsd(totals.legal)}`,
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Pagado al fisco',
              value: formatUsd(totals.paid),
              hint: `${totals.target > 0 ? formatPercent((totals.paid / totals.target) * 100) : '0%'} de avance`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente de pago',
              value: formatUsd(totals.pending),
            },
            {
              icon: Wallet,
              tone: 'cyan',
              label: 'Cantidad de retenciones',
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
          searchPlaceholder="Buscar por médico, orden, paciente…"
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
                  <SelectValue placeholder="Médico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Médico: todos</SelectItem>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {doctorFullName(d)}
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
                  <SelectItem value="unpaid">{STATUS_LABEL.unpaid}</SelectItem>
                  <SelectItem value="partially_paid">
                    {STATUS_LABEL.partially_paid}
                  </SelectItem>
                  <SelectItem value="paid">{STATUS_LABEL.paid}</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Médico</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Retención</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">% Retención</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto retenido</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Total USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Total Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pagado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pagado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente Bs.</TableHead>
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
                    icon={Receipt}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin impuestos retenidos'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han generado retenciones a médicos.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map(({ t, order }) => {
                const tgBs = taxAmountBs(t);
                const pBs = paidBs(t);
                const penBs = pendingBs(t);
                const tgUsd = bsToUsd(tgBs, usdRate);
                const pUsd = bsToUsd(pBs, usdRate);
                const penUsd = bsToUsd(penBs, usdRate);
                const rate = t.taxRate ? Number(t.taxRate) * 100 : null;
                const orderNums = (t.orders ?? []).map((o) => o.orderNumber).join(', ');
                return (
                  <TableRow key={t.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      {recipientName(t)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <Badge variant="outline" className="text-xs font-normal">
                        {t.personType === 'legal_entity' ? 'Jurídico' : 'Natural'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {holderDisplayName(order?.patient)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {orderNums || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {t.taxPayableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(tgBs)} Bs.
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(tgUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(usdToBs(tgUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatUsd(pUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatBs(usdToBs(pUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatUsd(penUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatBs(usdToBs(penUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_TONE[t.status]} border-transparent`}
                      >
                        {STATUS_LABEL[t.status]}
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
          itemLabel="retenciones"
        />
      </div>
    </ReportShell>
  );
}
