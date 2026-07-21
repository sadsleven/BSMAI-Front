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
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { fullName as doctorFullName, type Doctor } from '@/modules/doctors/domain/models/doctor';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import { downloadReportTableXlsx } from '../components/reportsExcel';
import { formatBs, formatNumber, formatPercent } from '../../domain/format';
import {
  reportsGateway,
  type ReportTaxRow,
  type ReportTaxSummary,
  type TaxObligationState,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

const STATE_LABEL: Record<TaxObligationState, string> = {
  sin_lote: 'Por pagar',
  unpaid: 'Por pagar',
  partially_paid: 'Pago parcial',
  paid: 'Pagado',
};

const STATE_TONE: Record<TaxObligationState, string> = {
  sin_lote: 'bg-warning-soft text-warning',
  unpaid: 'bg-warning-soft text-warning',
  partially_paid: 'bg-brand-cyan-soft text-brand-blue-strong',
  paid: 'bg-success-soft text-success',
};

const COLUMNS = 9;

const EMPTY_SUMMARY: ReportTaxSummary = {
  count: 0,
  taxAmountBs: 0,
  paidBs: 0,
  pendingBs: 0,
};

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
      status: sp.get('status') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportTaxRow[]>([]);
  const [summary, setSummary] = useState<ReportTaxSummary>(EMPTY_SUMMARY);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.taxesRetained({
          from: filters.from || undefined,
          to: filters.to || undefined,
          doctorId: filters.doctorId || undefined,
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
  }, [filters.from, filters.to, filters.doctorId, filters.status, filters.search]);

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

  const splitByPerson = useMemo(() => {
    let natural = 0;
    let legal = 0;
    rows.forEach((r) => {
      if (r.personType === 'legal_entity') legal += r.taxAmountBs;
      else natural += r.taxAmountBs;
    });
    return { natural, legal };
  }, [rows]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return rows.slice(start, start + filters.limit);
  }, [rows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(rows.length / filters.limit));

  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.doctorId || !!filters.status;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Reporte de impuestos retenidos"
      description={`${formatNumber(summary.count)} retenci${summary.count === 1 ? 'ón' : 'ones'} en el rango filtrado`}
      headerRight={
        <ReportDownloadButton
          disabled={loading || rows.length === 0}
          onDownload={() =>
            downloadReportTableXlsx({
              filename: 'Impuestos-retenidos',
              title: 'Impuestos retenidos',
              sheetName: 'IMPUESTOS RETENIDOS',
              rows,
              columns: [
                { header: 'Médico/Centro', value: (r) => r.providerName, width: 26 },
                {
                  header: 'Tipo',
                  value: (r) => (r.personType === 'legal_entity' ? 'Jurídico' : 'Natural'),
                  width: 10,
                },
                {
                  header: 'Órdenes internas',
                  value: (r) => (r.internalNumbers ?? []).join(', '),
                  width: 18,
                },
                { header: 'N° Retención', value: (r) => r.taxPayableNumber, width: 12, align: 'center' },
                { header: 'N° Lote', value: (r) => r.taxBatchNumber ?? '', width: 12, align: 'center' },
                { header: '% Ret.', value: (r) => (r.taxRate ? r.taxRate * 100 : 0), width: 9, numFmt: '0.0', align: 'center' },
                { header: 'Base Bs.', value: (r) => r.grossAmountBs, width: 14, numFmt: '#,##0.00', total: true },
                { header: 'Retenido Bs.', value: (r) => r.taxAmountBs, width: 14, numFmt: '#,##0.00', total: true },
                { header: 'Estado', value: (r) => STATE_LABEL[r.state], width: 12, align: 'center' },
              ],
            })
          }
        />
      }
      kpis={
        <KpiRow
          items={[
            {
              icon: Receipt,
              tone: 'blue',
              label: 'Total retenido',
              value: formatBs(summary.taxAmountBs),
              hint: `Natural ${formatBs(splitByPerson.natural)} · Jurídico ${formatBs(splitByPerson.legal)}`,
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Pagado al SENIAT',
              value: formatBs(summary.paidBs),
              hint: `${summary.taxAmountBs > 0 ? formatPercent((summary.paidBs / summary.taxAmountBs) * 100) : '0%'} de avance`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente de pago',
              value: formatBs(summary.pendingBs),
              hint: 'Incluye retenciones por pagar',
            },
            {
              icon: Wallet,
              tone: 'cyan',
              label: 'Cantidad de retenciones',
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
          searchPlaceholder="Buscar por médico, orden interna, N° retención…"
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
                  <SelectItem value="unpaid">{STATE_LABEL.unpaid}</SelectItem>
                  <SelectItem value="partially_paid">{STATE_LABEL.partially_paid}</SelectItem>
                  <SelectItem value="paid">{STATE_LABEL.paid}</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Médico/Centro</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Órdenes internas</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Retención</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Lote</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">% Ret.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Base Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Retenido Bs.</TableHead>
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
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han generado retenciones a médicos.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => {
                const rate = r.taxRate ? r.taxRate * 100 : null;
                const orderNums = (r.internalNumbers ?? []).join(', ');
                return (
                  <TableRow key={r.taxPayableId} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      {r.providerName}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <Badge variant="outline" className="text-xs font-normal">
                        {r.personType === 'legal_entity' ? 'Jurídico' : 'Natural'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono truncate max-w-[160px]">
                      {orderNums || '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {r.taxPayableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {r.taxBatchNumber ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatBs(r.grossAmountBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(r.taxAmountBs)}
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
          total={rows.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="retenciones"
        />
        </div>
      </div>
    </ReportShell>
  );
}
