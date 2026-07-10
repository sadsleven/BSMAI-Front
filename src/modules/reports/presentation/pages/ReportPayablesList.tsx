import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, TrendingUp, AlertCircle, Wallet } from 'lucide-react';
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
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import { fullName as doctorFullName, type Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import { downloadPayablesReportXlsx } from '../components/reportsExcel';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type ReportPayableRow,
  type ReportPayableSummary,
  type PayableObligationState,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

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

const COLUMNS = 8;

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

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return rows.slice(start, start + filters.limit);
  }, [rows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(rows.length / filters.limit));

  return (
    <ReportShell
      title="Reporte de cuentas por pagar"
      description={`${formatNumber(summary.count)} obligaci${summary.count === 1 ? 'ón' : 'ones'} en el rango filtrado`}
      headerRight={
        <ReportDownloadButton
          disabled={loading || rows.length === 0}
          onDownload={() => downloadPayablesReportXlsx(rows)}
        />
      }
      kpis={
        <KpiRow
          items={[
            {
              icon: Wallet,
              tone: 'blue',
              label: 'Neto a pagar',
              value: formatBs(summary.netBs),
              hint: `Total ${formatUsd(summary.grossUsd)} · tras retenciones`,
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Total pagado',
              value: formatBs(summary.paidBs),
              hint: `${summary.netBs > 0 ? ((summary.paidBs / summary.netBs) * 100).toFixed(1) : '0.0'}% de avance`,
            },
            {
              icon: AlertCircle,
              tone: 'warning',
              label: 'Pendiente por pagar',
              value: formatBs(summary.pendingBs),
              hint: 'Incluye obligaciones por pagar',
            },
            {
              icon: Banknote,
              tone: 'cyan',
              label: 'Cantidad de obligaciones',
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
          searchPlaceholder="Buscar por proveedor, orden interna…"
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
                      {c.businessName}
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Proveedor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Paciente</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Procedimiento</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">N° Orden</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Neto Bs.</TableHead>
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
              paged.map((r) => (
                <TableRow
                  key={r.orderId + r.internalNumber}
                  className="hover:bg-[oklch(0.985_0.003_250)]"
                >
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(r.orderDate)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-medium">
                    <div>{r.providerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                      {r.insuranceName ? ` · ${r.insuranceName}` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm truncate">
                    {r.patientName || '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm truncate max-w-[220px]">
                    {r.procedure || '—'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono">
                    {r.internalNumber}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatUsd(r.grossUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatBs(r.netBs)}
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
          itemLabel="obligaciones"
        />
        </div>
      </div>
    </ReportShell>
  );
}
