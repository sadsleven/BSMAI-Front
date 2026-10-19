import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TrendingUp, Banknote, Coins, Building2 } from 'lucide-react';
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
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import { downloadIncomeRelationXlsx } from '../components/reportsExcel';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type InvoiceStatus,
  type ReportInvoiceClientRow,
  type ReportInvoiceRow,
  type ReportInvoiceSummary,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

const COLUMNS = 9;

const EMPTY_SUMMARY: ReportInvoiceSummary = {
  count: 0,
  activeCount: 0,
  cancelledCount: 0,
  amountUsd: 0,
  amountBs: 0,
  costUsd: 0,
  marginUsd: 0,
  avgUsd: 0,
  avgRateBs: 0,
};

/**
 * Relación de ingresos: el libro de facturación del período en orden
 * cronológico — monto facturado $, tasa del día y monto en Bs por factura,
 * con las anuladas en su renglón (sin monto) para no saltar el correlativo.
 */
export function ReportIncomeRelation() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      insuranceId: sp.get('insuranceId') ?? '',
      status: (sp.get('status') ?? '') as '' | InvoiceStatus,
      clientType: (sp.get('clientType') ?? '') as '' | 'insurance' | 'holder',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportInvoiceRow[]>([]);
  const [byClient, setByClient] = useState<ReportInvoiceClientRow[]>([]);
  const [summary, setSummary] = useState<ReportInvoiceSummary>(EMPTY_SUMMARY);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await insuranceGateway.listAssignable();
        if (!cancelled) setInsurances(list);
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
        const res = await reportsGateway.incomeRelation({
          from: filters.from || undefined,
          to: filters.to || undefined,
          insuranceId: filters.insuranceId || undefined,
          status: filters.status || undefined,
          clientType: filters.clientType || undefined,
          search: filters.search || undefined,
        });
        if (cancelled) return;
        setRows(res.rows);
        setByClient(res.byClient);
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
  }, [
    filters.from,
    filters.to,
    filters.insuranceId,
    filters.status,
    filters.clientType,
    filters.search,
  ]);

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
    !!filters.insuranceId ||
    !!filters.status ||
    !!filters.clientType;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return rows.slice(start, start + filters.limit);
  }, [rows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(rows.length / filters.limit));

  const topClient = byClient[0];
  const marginPct =
    summary.amountUsd > 0 ? (summary.marginUsd / summary.amountUsd) * 100 : 0;

  return (
    <ReportShell
      title="Relación de ingresos"
      description={`${formatNumber(summary.activeCount)} factura${summary.activeCount === 1 ? '' : 's'} del período${
        summary.cancelledCount > 0
          ? ` · ${formatNumber(summary.cancelledCount)} anulada${summary.cancelledCount === 1 ? '' : 's'}`
          : ''
      }`}
      kpis={
        <KpiRow
          items={[
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Ingresos facturados',
              value: formatUsd(summary.amountUsd),
              hint: `${formatNumber(summary.activeCount)} facturas · promedio ${formatUsd(summary.avgUsd)}`,
            },
            {
              icon: Banknote,
              tone: 'blue',
              label: 'Ingresos en bolívares',
              value: formatBs(summary.amountBs),
              hint:
                summary.avgRateBs > 0
                  ? `Tasa promedio ${formatBs(summary.avgRateBs)}`
                  : 'Sin tasa registrada',
            },
            {
              icon: Coins,
              tone: 'warning',
              label: 'Costo de proveedores',
              value: formatUsd(summary.costUsd),
              hint: `Margen ${formatUsd(summary.marginUsd)} (${marginPct.toFixed(1)}%)`,
            },
            {
              icon: Building2,
              tone: 'cyan',
              label: 'Cliente principal',
              value: topClient?.clientName ?? '—',
              hint: topClient ? formatUsd(topClient.amountUsd) : undefined,
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          actions={
            <ReportDownloadButton
              disabled={loading || rows.length === 0}
              onDownload={() =>
                downloadIncomeRelationXlsx(rows, {
                  from: filters.from || undefined,
                  to: filters.to || undefined,
                })
              }
            />
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N° factura, control, cliente, paciente…"
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
                onValueChange={(v) => updateParam({ insuranceId: v === 'all' ? undefined : v })}
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
                value={filters.clientType || 'all'}
                onValueChange={(v) => updateParam({ clientType: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo de cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cliente: todos</SelectItem>
                  <SelectItem value="insurance">Solo seguros</SelectItem>
                  <SelectItem value="holder">Solo titulares</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => updateParam({ status: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todas</SelectItem>
                  <SelectItem value="active">Vigentes</SelectItem>
                  <SelectItem value="cancelled">Anuladas</SelectItem>
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
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Factura</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden interna</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto facturado $</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Tasa del día</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Monto facturado Bs.</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Costo $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonTableRows rows={6} columns={COLUMNS} />
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="p-0">
                    <EmptyState
                      icon={TrendingUp}
                      title={hasActiveFilters ? 'Sin resultados' : 'Sin ingresos facturados'}
                      description={
                        hasActiveFilters
                          ? 'Ajusta los filtros para ver más resultados.'
                          : 'Aún no se han emitido facturas en el período.'
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((r) => {
                  const cancelled = r.status === 'cancelled';
                  return (
                    <TableRow key={r.invoiceId} className="hover:bg-[oklch(0.985_0.003_250)]">
                      <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(r.invoiceDate)}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm">
                        {cancelled ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-transparent bg-destructive-soft text-destructive"
                          >
                            Anulada
                          </Badge>
                        ) : (
                          <>
                            <div className="font-medium truncate">{r.clientName}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              Titular: {r.holderName}
                            </div>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm truncate">
                        {cancelled ? '—' : r.patientName || '—'}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono">
                        <div>{r.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          Control: {r.controlNumber || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono">
                        {cancelled ? '—' : r.internalNumbers || r.orderNumbers}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                        {cancelled ? '—' : formatUsd(r.amountUsd)}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                        {cancelled || r.rateBs == null ? '—' : formatBs(r.rateBs)}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                        {cancelled || r.amountBs == null ? '—' : formatBs(r.amountBs)}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                        {cancelled ? '—' : formatUsd(r.costUsd)}
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
            total={rows.length}
            lastPage={lastPage}
            onPageChange={(p) => updateParam({ page: String(p) }, false)}
            onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
            itemLabel="facturas"
          />
        </div>
      </div>
    </ReportShell>
  );
}
