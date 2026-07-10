import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock4, AlertCircle, TrendingDown, Hourglass } from 'lucide-react';
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
  type AgingBucketRow,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

type Mode = 'receivable' | 'payable';

const BUCKET_LABEL: Record<AgingBucketRow['bucket'], string> = {
  '0-30': '0–30 días',
  '31-60': '31–60 días',
  '61-90': '61–90 días',
  '90+': 'Más de 90 días',
};

export function ReportAging() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      mode: (sp.get('mode') ?? 'receivable') as Mode,
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
    }),
    [sp],
  );
  const [payable, setPayable] = useState<AgingBucketRow[]>([]);
  const [receivable, setReceivable] = useState<AgingBucketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.aging({
          from: filters.from || undefined,
          to: filters.to || undefined,
        });
        if (cancelled) return;
        setPayable(res.rows.payable);
        setReceivable(res.rows.receivable);
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

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const buckets = filters.mode === 'receivable' ? receivable : payable;
  // Receivable se mide en USD (target nativo); payable en Bs (neto exacto).
  const isReceivable = filters.mode === 'receivable';
  const valueOf = (b: AgingBucketRow) => (isReceivable ? b.amountUsd : b.amountBs);
  const fmt = isReceivable ? formatUsd : formatBs;

  const byBucket = (key: AgingBucketRow['bucket']) =>
    buckets.find((b) => b.bucket === key) ?? { bucket: key, count: 0, amountUsd: 0, amountBs: 0 };

  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const hasActiveFilters = filters.mode !== 'receivable' || !!filters.from || !!filters.to;
  const clearFilters = () => setSp(new URLSearchParams(), { replace: true });

  return (
    <ReportShell
      title="Antigüedad de saldos"
      description={`Distribución del saldo pendiente por días — modo ${isReceivable ? 'cuentas por cobrar' : 'cuentas por pagar'}`}
      headerRight={
        <ReportDownloadButton
          disabled={loading || totalCount === 0}
          onDownload={() =>
            downloadReportTableXlsx({
              filename: `Antiguedad-de-saldos-${isReceivable ? 'cobrar' : 'pagar'}`,
              title: `Antigüedad de saldos — ${isReceivable ? 'Cuentas por cobrar' : 'Cuentas por pagar'}`,
              sheetName: 'ANTIGUEDAD DE SALDOS',
              rows: (['0-30', '31-60', '61-90', '90+'] as const).map((k) => byBucket(k)),
              columns: [
                { header: 'Antigüedad', value: (b) => BUCKET_LABEL[b.bucket], width: 18 },
                { header: 'Obligaciones', value: (b) => b.count, width: 13, numFmt: '#,##0', total: true },
                {
                  header: isReceivable ? 'Pendiente USD' : 'Pendiente Bs.',
                  value: (b) => valueOf(b),
                  width: 16,
                  numFmt: isReceivable ? '0.00' : '#,##0.00',
                  total: true,
                },
              ],
            })
          }
        />
      }
      kpis={
        <KpiRow
          items={[
            { icon: Hourglass, tone: 'success', label: '0–30 días', value: fmt(valueOf(byBucket('0-30'))) },
            { icon: Clock4, tone: 'cyan', label: '31–60 días', value: fmt(valueOf(byBucket('31-60'))) },
            { icon: TrendingDown, tone: 'warning', label: '61–90 días', value: fmt(valueOf(byBucket('61-90'))) },
            { icon: AlertCircle, tone: 'destructive', label: 'Más de 90 días', value: fmt(valueOf(byBucket('90+'))) },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <DateRangeFilter
                from={filters.from || undefined}
                to={filters.to || undefined}
                onChange={(f, t) => updateParam({ from: f, to: t })}
              />
              <Select value={filters.mode} onValueChange={(v) => updateParam({ mode: v })}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receivable">Cuentas por cobrar (USD)</SelectItem>
                  <SelectItem value="payable">Cuentas por pagar (Bs)</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Antigüedad</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Obligaciones</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {isReceivable ? 'Pendiente USD' : 'Pendiente Bs.'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={4} columns={3} />
            ) : totalCount === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="p-0">
                  <EmptyState
                    icon={Clock4}
                    title="Sin saldos pendientes"
                    description="No hay obligaciones pendientes en este momento."
                  />
                </TableCell>
              </TableRow>
            ) : (
              (['0-30', '31-60', '61-90', '90+'] as const).map((key) => {
                const b = byBucket(key);
                return (
                  <TableRow key={key} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      {BUCKET_LABEL[key]}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(b.count)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right font-semibold">
                      {fmt(valueOf(b))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
