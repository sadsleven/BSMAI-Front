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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  downloadReceivablesReportXlsx,
  reportRowDate,
} from '../components/reportsExcel';
import {
  costRowKeys,
  receivableAmounts,
  receivablesSummaryByDebtor,
  receivablesSummaryTotals,
} from '../../domain/receivablesSummary';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import { useUsdRate } from '../../domain/useUsdRate';
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
  sin_lote: 'bg-warning-soft text-warning',
  uncollected: 'bg-warning-soft text-warning',
  partially_collected: 'bg-brand-cyan-soft text-brand-blue-strong',
  collected: 'bg-success-soft text-success',
  overcollected: 'bg-brand-blue-soft text-brand-blue-strong',
};

const COLUMNS = 16;

/** Cabecera centrada del cuadro resumen. */
const TH_CENTER =
  'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center whitespace-nowrap';

const compareDoc = (a: string, b: string): number =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Orden del reporte: primero las órdenes facturadas (por N° de factura) y
 * luego las que no tienen factura (por N° de orden).
 */
function sortReceivables(rows: ReportReceivableRow[]): ReportReceivableRow[] {
  return [...rows].sort((a, b) => {
    const ai = (a.invoiceNumber ?? '').trim();
    const bi = (b.invoiceNumber ?? '').trim();
    if (ai && !bi) return -1;
    if (!ai && bi) return 1;
    const byDoc = ai && bi ? compareDoc(ai, bi) : 0;
    return byDoc || compareDoc(a.orderNumber, b.orderNumber) || a.portion.localeCompare(b.portion);
  });
}

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
      // `debtorType` filtra seguro/titular; `state`, el estado de cobro.
      debtorType: sp.get('debtorType') ?? '',
      state: sp.get('state') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportReceivableRow[]>([]);
  const [summary, setSummary] = useState<ReportReceivableSummary>(EMPTY_SUMMARY);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentRateBs = useUsdRate();

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
          debtorType: (filters.debtorType || undefined) as
            | 'insurance'
            | 'holder'
            | undefined,
          state: (filters.state || undefined) as ReceivableOrderState | undefined,
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
  }, [
    filters.from,
    filters.to,
    filters.insuranceId,
    filters.debtorType,
    filters.state,
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
    !!filters.debtorType ||
    !!filters.state;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  // Vista: el detalle orden por orden o el cuadro resumen por deudor.
  const [view, setView] = useState<'detail' | 'summary'>('detail');

  const sortedRows = useMemo(() => sortReceivables(rows), [rows]);

  // Cuadro resumen por deudor: el MISMO cálculo que la primera hoja del Excel.
  const debtorSummary = useMemo(
    () => receivablesSummaryByDebtor(sortedRows, currentRateBs),
    [sortedRows, currentRateBs],
  );

  const debtorTotals = useMemo(
    () => receivablesSummaryTotals(debtorSummary),
    [debtorSummary],
  );

  // Interruptor "solo pendientes": por defecto el documento trae lo que falta
  // cobrar; apagado, incluye también las órdenes ya cobradas.
  const onlyPending = filters.state === 'uncollected';
  /**
   * Filas que llevan el COSTO impreso. El costo es por ORDEN: una orden mixta
   * emite dos filas (porción fija + indexada) con el mismo costo, y el Excel
   * sólo lo imprime en la primera — la tabla replica ese criterio para que los
   * dos cuadren.
   */
  const costoRowKeys = useMemo(() => costRowKeys(sortedRows), [sortedRows]);
  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return sortedRows.slice(start, start + filters.limit);
  }, [sortedRows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(sortedRows.length / filters.limit));

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
          actions={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="receivables-only-pending"
                  checked={onlyPending}
                  onCheckedChange={(checked) =>
                    updateParam({ state: checked ? 'uncollected' : undefined })
                  }
                />
                <label
                  htmlFor="receivables-only-pending"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Solo pendientes
                </label>
              </div>
              <ReportDownloadButton
                disabled={loading || sortedRows.length === 0}
                onDownload={() =>
                  downloadReceivablesReportXlsx(sortedRows, currentRateBs, {
                    includeCollected: !onlyPending,
                  })
                }
              />
            </div>
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N° factura, aseguradora, titular, N° orden…"
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
                value={filters.debtorType || 'all'}
                onValueChange={(v) =>
                  updateParam({ debtorType: v === 'all' ? undefined : v })
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
              <Select
                value={filters.state || 'all'}
                onValueChange={(v) =>
                  updateParam({ state: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Estado de cobro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estado: todas</SelectItem>
                  <SelectItem value="uncollected">{STATE_LABEL.uncollected}</SelectItem>
                  <SelectItem value="partially_collected">
                    {STATE_LABEL.partially_collected}
                  </SelectItem>
                  <SelectItem value="collected">{STATE_LABEL.collected}</SelectItem>
                  <SelectItem value="overcollected">
                    {STATE_LABEL.overcollected}
                  </SelectItem>
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

        <div className="px-4 pt-4">
          <Tabs value={view} onValueChange={(v) => setView(v as 'detail' | 'summary')}>
            <TabsList>
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="detail">Detalle</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === 'summary' ? (
          <div className="m-4 rounded-lg border overflow-hidden">
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH_CENTER}>Seguro / Titular</TableHead>
                  <TableHead className={TH_CENTER}>Tipo</TableHead>
                  <TableHead className={TH_CENTER}>Órdenes</TableHead>
                  <TableHead className={TH_CENTER}>Monto facturado $</TableHead>
                  <TableHead className={TH_CENTER}>
                    {currentRateBs
                      ? `Monto actualizado (Tasa: ${formatNumber(currentRateBs, 2)})`
                      : 'Monto actualizado $'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonTableRows rows={6} columns={5} />
                ) : debtorSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
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
                  <>
                    {debtorSummary.map((d) => (
                      <TableRow key={d.key} className="hover:bg-[oklch(0.985_0.003_250)]">
                        <TableCell className="py-3 px-3 text-sm font-medium" wrap>
                          {d.name}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-center text-muted-foreground">
                          {d.type === 'holder' ? 'Titular' : 'Seguro'}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-center">
                          {formatNumber(d.count)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-mono text-center">
                          {formatUsd(d.usd)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-mono text-center font-semibold">
                          {formatUsd(d.updatedUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell className="py-3 px-3 text-sm" colSpan={3}>
                        TOTAL
                      </TableCell>
                      <TableCell className="py-3 px-3 text-sm font-mono text-center">
                        {formatUsd(debtorTotals.usd)}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-sm font-mono text-center">
                        {formatUsd(debtorTotals.updatedUsd)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
        <div className="m-4 rounded-lg border overflow-hidden">
        <Table stickyHeader>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">N° Factura</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Cliente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Titular</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">RIF titular</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">RIF paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Médico tratante</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">N° Clave</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">N° Control</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">N° Orden interna</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Monto facturado $</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Tasa del día</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Monto Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Costo $</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Estado</TableHead>
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
              paged.map((r) => {
                const { usd, rate, bs } = receivableAmounts(r, currentRateBs);
                return (
                  <TableRow
                    key={`${r.orderId}-${r.portion}`}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {/* Fecha de FACTURA; si la orden aún no se facturó, la suya. */}
                      {formatDate(reportRowDate(r) ?? r.orderDate)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.invoiceNumber || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <div className="font-medium">{r.debtorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.debtorType === 'holder' ? 'Titular' : 'Seguro'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">{r.holderName || '—'}</TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.holderId || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {r.patientName || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.patientId || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm max-w-[220px]" wrap>
                      {r.doctorName || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.serviceKey || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.controlNumber || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.orderNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(usd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {rate != null ? formatNumber(rate, 2) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {bs != null ? formatBs(bs) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {costoRowKeys.has(`${r.orderId}-${r.portion}`)
                        ? formatUsd(r.costoUsd ?? 0)
                        : '—'}
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
                );
              })
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={sortedRows.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="órdenes"
        />
        </div>
        )}
      </div>
    </ReportShell>
  );
}
