import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCog, TrendingUp, Crown, Stethoscope } from 'lucide-react';
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
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import { downloadReportTableXlsx } from '../components/reportsExcel';
import { formatUsd, formatBs, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type ReportPayableProviderRow,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

export function ReportDoctorProduction() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      providerType: sp.get('providerType') ?? '',
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportPayableProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.payablesByProvider({
          from: filters.from || undefined,
          to: filters.to || undefined,
        });
        if (cancelled) return;
        setRows(res.rows);
      } catch (e) {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === filters.search) return;
      const next = new URLSearchParams(sp);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows
      .filter((r) => !filters.providerType || r.providerType === filters.providerType)
      .filter((r) => !s || r.providerName.toLowerCase().includes(s))
      .sort((a, b) => b.grossUsd - a.grossUsd);
  }, [rows, filters.providerType, filters.search]);

  const top = filtered[0];
  const totalOrders = filtered.reduce((s, r) => s + r.ordersCount, 0);
  const totalGrossUsd = filtered.reduce((s, r) => s + r.grossUsd, 0);
  const totalPaidBs = filtered.reduce((s, r) => s + r.paidBs, 0);
  const totalPendingBs = filtered.reduce((s, r) => s + r.pendingBs, 0);

  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.providerType;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Producción por médico"
      description="Volumen de órdenes y monto generado por cada proveedor (doctor o centro de atención)"
      headerRight={
        <ReportDownloadButton
          disabled={loading || filtered.length === 0}
          onDownload={() =>
            downloadReportTableXlsx({
              filename: 'Produccion-por-medico',
              title: 'Producción por médico',
              sheetName: 'PRODUCCION POR MEDICO',
              rows: filtered,
              columns: [
                { header: '#', value: (_r, i) => i + 1, width: 5, align: 'center' },
                { header: 'Proveedor', value: (r) => r.providerName, width: 26 },
                { header: 'Tipo', value: (r) => (r.providerType === 'doctor' ? 'Doctor' : 'Centro'), width: 10 },
                { header: 'Órdenes', value: (r) => r.ordersCount, width: 10, numFmt: '#,##0', total: true },
                { header: 'Lotes', value: (r) => r.lotesCount, width: 8, numFmt: '#,##0', total: true },
                { header: 'Total USD', value: (r) => r.grossUsd, width: 13, numFmt: '0.00', total: true },
                { header: 'Total Bs.', value: (r) => r.grossBs, width: 14, numFmt: '#,##0.00', total: true },
                { header: 'Neto Bs.', value: (r) => r.netBs, width: 14, numFmt: '#,##0.00', total: true },
                { header: 'Pagado Bs.', value: (r) => r.paidBs, width: 14, numFmt: '#,##0.00', total: true },
                { header: 'Pendiente Bs.', value: (r) => r.pendingBs, width: 14, numFmt: '#,##0.00', total: true },
              ],
            })
          }
        />
      }
      kpis={
        <KpiRow
          items={[
            {
              icon: UserCog,
              tone: 'blue',
              label: 'Proveedores activos',
              value: formatNumber(filtered.length),
              hint: `${formatNumber(totalOrders)} órdenes`,
            },
            {
              icon: Stethoscope,
              tone: 'cyan',
              label: 'Total facturado al proveedor',
              value: formatUsd(totalGrossUsd),
              hint: 'Bruto, antes de retenciones',
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Pagado',
              value: formatBs(totalPaidBs),
              hint: `Pendiente ${formatBs(totalPendingBs)}`,
            },
            {
              icon: Crown,
              tone: 'warning',
              label: 'Top proveedor',
              value: top ? top.providerName : '—',
              hint: top ? formatUsd(top.grossUsd) : undefined,
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar proveedor…"
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
                value={filters.providerType || 'all'}
                onValueChange={(v) =>
                  updateParam({ providerType: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  <SelectItem value="doctor">Solo doctores</SelectItem>
                  <SelectItem value="care_center">Solo centros</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Proveedor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Lotes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">TotalUSD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">TotalBs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Neto Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pagado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pendiente Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={10} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState
                    icon={UserCog}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin producción registrada'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han facturado órdenes a proveedores.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, idx) => (
                <TableRow
                  key={`${r.providerType}:${r.providerId}`}
                  className="hover:bg-[oklch(0.985_0.003_250)]"
                >
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-medium">
                    {r.providerName}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {r.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatNumber(r.ordersCount)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatNumber(r.lotesCount)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatUsd(r.grossUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatBs(r.grossBs)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatBs(r.netBs)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatBs(r.paidBs)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                    {formatBs(r.pendingBs)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
