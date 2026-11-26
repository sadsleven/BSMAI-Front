import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import { fullName as doctorFullName, type Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import { ReportShell } from '../components/ReportShell';
import { ReportViewTabs } from '../components/ReportViewTabs';
import { ToggleFilter } from '../components/ToggleFilter';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import {
  downloadMonthlyStatementXlsx,
  downloadPayablesReportXlsx,
  formatPayablePaymentRef,
  reportRowDate,
} from '../components/reportsExcel';
import {
  isMonthlyStatementProvider,
  MONTHLY_STATEMENT_LABEL,
} from '../../domain/monthlyStatement';
import {
  payablesSummaryByProvider,
  pendingUsdOf,
} from '../../domain/payablesSummary';
import { formatUsd, formatDate, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type ReportPayableRow,
  type ReportPayableSummary,
  type PayableObligationState,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';
import { careCenterLabel } from '@/lib/displayName';

const STATE_LABEL: Record<PayableObligationState, string> = {
  sin_lote: 'Por pagar',
  unpaid: 'Por pagar',
  partially_paid: 'Pago parcial',
  paid: 'Pagado',
};

const STATE_TONE: Record<PayableObligationState, string> = {
  sin_lote: 'bg-warning-soft text-warning',
  unpaid: 'bg-warning-soft text-warning',
  partially_paid: 'bg-brand-cyan-soft text-brand-blue-strong',
  paid: 'bg-success-soft text-success',
};


const REPORT_VIEWS = [
  { value: 'summary', label: 'Resumen' },
  { value: 'detail', label: 'Detalle' },
] as const satisfies readonly { value: 'summary' | 'detail'; label: string }[];

/** Cabecera centrada del cuadro resumen. */
const TH_CENTER =
  'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center whitespace-nowrap';

const EMPTY_SUMMARY: ReportPayableSummary = {
  count: 0,
  grossUsd: 0,
  grossBs: 0,
  netBs: 0,
  paidBs: 0,
  pendingBs: 0,
};

export function ReportPayablesList() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      doctorId: sp.get('doctorId') ?? '',
      careCenterId: sp.get('careCenterId') ?? '',
      status: sp.get('status') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportPayableRow[]>([]);
  const [summary, setSummary] = useState<ReportPayableSummary>(EMPTY_SUMMARY);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [careCenters, setCareCenters] = useState<CareCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // La columna FACTURACION $ sale del Excel sólo si se pide expresamente.
  const [includeFacturacion, setIncludeFacturacion] = useState(false);
  // Vista: el detalle renglón por renglón o el cuadro resumen por proveedor.
  const [view, setView] = useState<'detail' | 'summary'>('detail');

  useEffect(() => {
    (async () => {
      try {
        setDoctors(await doctorGateway.listAssignable());
      } catch {
        setDoctors([]);
      }
    })();
    (async () => {
      try {
        setCareCenters(await careCenterGateway.listAssignable());
      } catch {
        setCareCenters([]);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.payables({
          from: filters.from || undefined,
          to: filters.to || undefined,
          doctorId: filters.doctorId || undefined,
          careCenterId: filters.careCenterId || undefined,
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
  }, [
    filters.from,
    filters.to,
    filters.doctorId,
    filters.careCenterId,
    filters.status,
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
    !!filters.doctorId ||
    !!filters.careCenterId ||
    !!filters.status;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  // Las columnas de la tabla son las del Excel (hoja "LISTA GENERAL" + las de
  // pago de la hoja por proveedor), en el mismo orden, con el N° de factura
  // adelantado a la 2ª columna. FACTURACION $ sólo si el switch está activo.
  const columnCount = includeFacturacion ? 14 : 13;

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return rows.slice(start, start + filters.limit);
  }, [rows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(rows.length / filters.limit));

  // Cuadro resumen: cuánto se le debe a cada proveedor, de mayor a menor. Se
  // calcula sobre las mismas filas del detalle, así que respeta los filtros.
  const providerSummary = useMemo(
    () => payablesSummaryByProvider(rows),
    [rows],
  );
  const summaryTotals = useMemo(() => {
    let gross = 0;
    let paid = 0;
    let pending = 0;
    for (const p of providerSummary) {
      gross += p.grossUsd;
      paid += p.paidUsd;
      pending += p.pendingUsd;
    }
    return { gross, paid, pending };
  }, [providerSummary]);

  // Las obligaciones del proveedor con estado de cuenta mensual (RISLAB) van
  // en su propio documento, no en el libro general.
  const monthlyRows = useMemo(
    () => rows.filter((r) => isMonthlyStatementProvider(r.providerName)),
    [rows],
  );

  // Totales del detalle: se calculan sobre TODAS las filas (no sólo la página
  // actual) para que el pie de tabla refleje el monto completo del reporte.
  const detailTotals = useMemo(() => {
    let porPagar = 0;
    let pagadas = 0;
    let abonado = 0;
    // Lo abonado es del LOTE y se repite en cada fila: se cuenta una sola vez,
    // en la última orden de cada lote (mismo criterio que el listado).
    const lastIdxByBatch = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.payableId) lastIdxByBatch.set(r.payableId, i);
    });
    rows.forEach((r, i) => {
      const paid = r.state === 'paid';
      if (paid) pagadas += r.grossUsd ?? 0;
      else porPagar += r.grossUsd ?? 0;
      if (r.payableId && lastIdxByBatch.get(r.payableId) === i)
        abonado += r.payableCoveredUsd ?? 0;
    });
    return { porPagar, pagadas, abonado };
  }, [rows]);

  /**
   * Descarga el estado de cuenta mensual. Si hay fecha "desde", primero pide
   * lo anterior a esa fecha para arrancar con el SALDO ANTERIOR: sin eso el
   * documento partiría de cero y no cuadraría con lo que el proveedor lleva.
   */
  const downloadMonthlyStatement = async (): Promise<void> => {
    let openingBalanceUsd = 0;
    if (filters.from) {
      const dayBefore = new Date(`${filters.from}T12:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const previous = await reportsGateway.payables({
        to: dayBefore.toISOString().slice(0, 10),
        careCenterId: monthlyRows[0]?.providerId ?? undefined,
        doctorId: undefined,
      });
      openingBalanceUsd = pendingUsdOf(
        previous.rows.filter((r) => isMonthlyStatementProvider(r.providerName)),
      );
    }
    await downloadMonthlyStatementXlsx(monthlyRows, {
      providerName: monthlyRows[0]?.providerName,
      openingBalanceUsd,
    });
  };

  return (
    <ReportShell
      title="Reporte de cuentas por pagar"
      description={`${formatNumber(summary.count)} obligaci${summary.count === 1 ? 'ón' : 'ones'} en el rango filtrado`}
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          actions={
            <>
              {monthlyRows.length > 0 ? (
                <ReportDownloadButton
                  variant="outline"
                  label={`Estado de cuenta ${MONTHLY_STATEMENT_LABEL}`}
                  disabled={loading}
                  onDownload={downloadMonthlyStatement}
                />
              ) : null}
              <ReportDownloadButton
                disabled={loading || rows.length === 0}
                onDownload={() => downloadPayablesReportXlsx(rows, { includeFacturacion })}
              />
            </>
          }
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por N° factura, proveedor, orden interna…"
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
                  <SelectValue placeholder="Doctor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Doctor: todos</SelectItem>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {doctorFullName(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.careCenterId || 'all'}
                onValueChange={(v) =>
                  updateParam({ careCenterId: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Centro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Centro: todos</SelectItem>
                  {careCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {careCenterLabel(c)}
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
                  <SelectItem value="unpaid">{STATE_LABEL.unpaid}</SelectItem>
                  <SelectItem value="partially_paid">{STATE_LABEL.partially_paid}</SelectItem>
                  <SelectItem value="paid">{STATE_LABEL.paid}</SelectItem>
                </SelectContent>
              </Select>
              <ToggleFilter
                id="payables-facturacion"
                label="Incluir FACTURACION $"
                checked={includeFacturacion}
                onCheckedChange={setIncludeFacturacion}
              />
            </>
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <ReportViewTabs
          value={view}
          onChange={setView}
          options={REPORT_VIEWS}
          right={
            view === 'summary'
              ? `${formatNumber(providerSummary.length)} proveedor${providerSummary.length === 1 ? '' : 'es'}`
              : `${formatNumber(rows.length)} obligaci${rows.length === 1 ? 'ón' : 'ones'}`
          }
        />

        {view === 'summary' ? (
          <div className="m-4 rounded-lg border overflow-hidden">
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH_CENTER}>Nombre</TableHead>
                  <TableHead className={TH_CENTER}>Tipo</TableHead>
                  <TableHead className={TH_CENTER}>Órdenes</TableHead>
                  <TableHead className={TH_CENTER}>Total $</TableHead>
                  <TableHead className={TH_CENTER}>Abonado $</TableHead>
                  <TableHead className={TH_CENTER}>Órdenes por pagar $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonTableRows rows={6} columns={6} />
                ) : providerSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState
                        icon={Banknote}
                        title={hasActiveFilters ? 'Sin resultados' : 'Sin cuentas por pagar'}
                        description={
                          hasActiveFilters
                            ? 'Ajusta los filtros para ver más resultados.'
                            : 'Aún no hay obligaciones de pago a proveedores.'
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {providerSummary.map((prov) => (
                      <TableRow
                        key={prov.key}
                        className="hover:bg-[oklch(0.985_0.003_250)]"
                      >
                        <TableCell className="py-3 px-3 text-sm font-medium" wrap>
                          {prov.name}
                          {/* Su deuda va en un documento aparte, no en el libro general. */}
                          {isMonthlyStatementProvider(prov.name) ? (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] border-transparent bg-brand-cyan-soft text-brand-blue-strong"
                            >
                              Estado de cuenta aparte
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-center text-muted-foreground">
                          {prov.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-center">
                          {formatNumber(prov.ordersCount)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-mono text-center">
                          {formatUsd(prov.grossUsd)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-mono text-center text-success">
                          {formatUsd(prov.paidUsd)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-mono text-center font-semibold">
                          {formatUsd(prov.pendingUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell className="py-3 px-3 text-sm" colSpan={3}>
                        TOTAL
                      </TableCell>
                      <TableCell className="py-3 px-3 text-sm font-mono text-center">
                        {formatUsd(summaryTotals.gross)}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-sm font-mono text-center">
                        {formatUsd(summaryTotals.paid)}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-sm font-mono text-center">
                        {formatUsd(summaryTotals.pending)}
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Proveedor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Nombre del paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Seguros</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Procedimiento</TableHead>
              {includeFacturacion ? (
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Facturación $</TableHead>
              ) : null}
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Órdenes por pagar $</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Órdenes pagadas $</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Monto pagado $</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Fecha de pago</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Ref. del pago</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={columnCount} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="p-0">
                  <EmptyState
                    icon={Banknote}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin cuentas por pagar'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no hay obligaciones de pago a proveedores.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => {
                const paid = r.state === 'paid';
                const refs = (r.payments ?? []).map(formatPayablePaymentRef);
                return (
                  <TableRow
                    key={r.orderId + r.internalNumber}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {/* Fecha de FACTURA; si la orden aún no se facturó, la suya. */}
                      {formatDate(reportRowDate(r) ?? r.orderDate)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.invoiceNumber || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium max-w-[220px]" wrap>
                      <div>{r.providerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {r.patientName || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono whitespace-nowrap">
                      {r.internalNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {r.insuranceName || 'AFMI'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm max-w-[260px]" wrap>
                      {r.procedure || '—'}
                    </TableCell>
                    {includeFacturacion ? (
                      <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                        {formatUsd(r.facturacionUsd ?? 0)}
                      </TableCell>
                    ) : null}
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {paid ? '—' : formatUsd(r.grossUsd ?? 0)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {paid ? formatUsd(r.grossUsd ?? 0) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {/* Lo abonado es del LOTE (se repite en sus renglones) e
                          incluye los pagos parciales, no sólo los lotes saldados. */}
                      {r.payableCoveredUsd ? formatUsd(r.payableCoveredUsd) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {r.paymentDate ? formatDate(r.paymentDate) : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-xs max-w-[280px]" wrap>
                      {refs.length > 0 ? (
                        <div className="space-y-0.5">
                          {refs.map((ref, i) => (
                            <div key={i} title={ref}>
                              {ref}
                            </div>
                          ))}
                        </div>
                      ) : (
                        (r.paymentReference ?? '—')
                      )}
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
          <TableFooter>
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell colSpan={columnCount - 6} className="py-3 px-4 text-sm text-right">
                TOTAL
              </TableCell>
              <TableCell className="py-3 px-4 text-sm font-mono text-right">
                {formatUsd(detailTotals.porPagar)}
              </TableCell>
              <TableCell className="py-3 px-4 text-sm font-mono text-right">
                {formatUsd(detailTotals.pagadas)}
              </TableCell>
              <TableCell className="py-3 px-4 text-sm font-mono text-right">
                {formatUsd(detailTotals.abonado)}
              </TableCell>
              <TableCell className="py-3 px-4 text-sm" colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={rows.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="obligaciones"
        />
        </div>
        )}
      </div>
    </ReportShell>
  );
}
