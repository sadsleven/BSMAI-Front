import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { Wallet, TrendingUp, Clock4, PercentCircle, BarChart3, PieChart } from 'lucide-react';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ChartCard } from '../components/ChartCard';
import { CHART_COLORS, baseDoughnutOptions, withAlpha } from '../components/chartSetup';
import { formatUsd, formatPercent } from '../../domain/format';
import {
  reportsGateway,
  type ReportReceivableDebtorRow,
  type ReportReceivableRow,
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

const STATE_COLOR: Record<ReceivableOrderState, string> = {
  sin_lote: CHART_COLORS.blue,
  uncollected: CHART_COLORS.destructive,
  partially_collected: CHART_COLORS.warning,
  collected: CHART_COLORS.success,
  overcollected: CHART_COLORS.cyan,
};

const STATE_ORDER: ReceivableOrderState[] = [
  'collected',
  'partially_collected',
  'uncollected',
  'sin_lote',
  'overcollected',
];

export function ReportInsurerCollections() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({ from: sp.get('from') ?? '', to: sp.get('to') ?? '' }),
    [sp],
  );
  const [byInsurer, setByInsurer] = useState<ReportReceivableDebtorRow[]>([]);
  const [orders, setOrders] = useState<ReportReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const query = { from: filters.from || undefined, to: filters.to || undefined };
        const [grouped, perOrder] = await Promise.all([
          reportsGateway.receivablesByDebtor({ ...query, groupBy: 'insurance' }),
          reportsGateway.receivables(query),
        ]);
        if (cancelled) return;
        setByInsurer(grouped.rows.sort((a, b) => b.targetUsd - a.targetUsd));
        setOrders(perOrder.rows.filter((r) => r.debtorType === 'insurance'));
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

  const byStatus = useMemo(() => {
    const counts = new Map<ReceivableOrderState, number>();
    orders.forEach((o) => counts.set(o.state, (counts.get(o.state) ?? 0) + 1));
    return STATE_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [orders]);

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    byInsurer.forEach((r) => {
      billed += r.targetUsd;
      collected += r.collectedUsd;
      pending += r.pendingUsd;
    });
    const rate = billed > 0 ? (collected / billed) * 100 : 0;
    return { billed, collected, pending, rate };
  }, [byInsurer]);

  const top = byInsurer.slice(0, 10);

  const billedVsCollected: ChartData<'bar'> = {
    labels: top.map((r) => r.debtorName),
    datasets: [
      {
        label: 'Facturado',
        data: top.map((r) => r.targetUsd),
        backgroundColor: withAlpha(CHART_COLORS.blue, 0.85),
        borderRadius: 5,
      },
      {
        label: 'Cobrado',
        data: top.map((r) => r.collectedUsd),
        backgroundColor: withAlpha(CHART_COLORS.success, 0.85),
        borderRadius: 5,
      },
    ],
  };

  const billedVsCollectedOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 } },
      tooltip: {
        backgroundColor: '#0f172a',
        cornerRadius: 8,
        padding: 10,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatUsd(Number(ctx.parsed.x))}` },
      },
    },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(100, 116, 139, 0.12)' }, border: { display: false }, ticks: { callback: (v) => formatUsd(Number(v)) } },
      y: { grid: { display: false } },
    },
  };

  const collectionRate: ChartData<'bar'> = {
    labels: top.map((r) => r.debtorName),
    datasets: [
      {
        label: '% cobranza',
        data: top.map((r) => (r.targetUsd > 0 ? (r.collectedUsd / r.targetUsd) * 100 : 0)),
        backgroundColor: top.map((r) => {
          const pct = r.targetUsd > 0 ? (r.collectedUsd / r.targetUsd) * 100 : 0;
          if (pct >= 90) return withAlpha(CHART_COLORS.success, 0.85);
          if (pct >= 50) return withAlpha(CHART_COLORS.warning, 0.85);
          return withAlpha(CHART_COLORS.destructive, 0.85);
        }),
        borderRadius: 5,
      },
    ],
  };

  const collectionRateOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        cornerRadius: 8,
        padding: 10,
        callbacks: { label: (ctx) => `${formatPercent(Number(ctx.parsed.x))}` },
      },
    },
    scales: {
      x: { beginAtZero: true, max: 100, grid: { color: 'rgba(100, 116, 139, 0.12)' }, border: { display: false }, ticks: { callback: (v) => `${v}%` } },
      y: { grid: { display: false } },
    },
  };

  const statusData: ChartData<'doughnut'> = {
    labels: byStatus.map((s) => STATE_LABEL[s.status]),
    datasets: [
      {
        data: byStatus.map((s) => s.count),
        backgroundColor: byStatus.map((s) => STATE_COLOR[s.status]),
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const hasActiveFilters = !!filters.from || !!filters.to;
  const clearFilters = () => setSp(new URLSearchParams(), { replace: true });
  const noData = !loading && !error;

  return (
    <ReportShell
      title="Cobranzas por aseguradora"
      description="Salud de la cartera por cobrar: facturación, recaudo y morosidad por compañía de seguros"
      kpis={
        <KpiRow
          items={[
            { icon: Wallet, tone: 'blue', label: 'Total facturado', value: formatUsd(totals.billed) },
            { icon: TrendingUp, tone: 'success', label: 'Cobrado', value: formatUsd(totals.collected) },
            { icon: Clock4, tone: 'warning', label: 'Pendiente', value: formatUsd(totals.pending) },
            {
              icon: PercentCircle,
              tone: 'cyan',
              label: '% Cobranza',
              value: formatPercent(totals.rate),
              hint: 'Cobrado sobre facturado',
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <DateRangeFilter
              from={filters.from || undefined}
              to={filters.to || undefined}
              onChange={(f, t) => updateParam({ from: f, to: t })}
            />
          }
        />
      </div>

      {error ? (
        <div className="px-4 py-2 text-sm text-destructive border border-destructive-soft bg-destructive-soft rounded-lg">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Facturado vs Cobrado por aseguradora"
          description="Top 10 por monto facturado (USD)"
          icon={BarChart3}
          height={380}
          className="lg:col-span-2"
          empty={noData && top.length === 0}
          emptyText="Sin cuentas por cobrar en el rango"
        >
          {top.length > 0 ? <Bar data={billedVsCollected} options={billedVsCollectedOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="Órdenes por estado"
          description="Distribución de la cartera (incluye por cobrar)"
          icon={PieChart}
          height={380}
          empty={noData && byStatus.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {byStatus.length > 0 ? <Doughnut data={statusData} options={baseDoughnutOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="% de cobranza por aseguradora"
          description="Verde ≥90% · Ámbar ≥50% · Rojo <50%"
          icon={PercentCircle}
          height={380}
          className="lg:col-span-3"
          empty={noData && top.length === 0}
          emptyText="Sin cuentas por cobrar en el rango"
        >
          {top.length > 0 ? <Bar data={collectionRate} options={collectionRateOptions} /> : null}
        </ChartCard>
      </div>
    </ReportShell>
  );
}
