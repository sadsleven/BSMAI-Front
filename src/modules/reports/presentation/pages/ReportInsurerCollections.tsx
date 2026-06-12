import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { Wallet, TrendingUp, Clock4, PercentCircle, BarChart3, PieChart } from 'lucide-react';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import {
  STATUS_LABEL,
  collectedUsd,
  targetUsd,
  type AccountsReceivable,
  type AccountsReceivableStatus,
} from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ChartCard } from '../components/ChartCard';
import { CHART_COLORS, baseDoughnutOptions, withAlpha } from '../components/chartSetup';
import { formatUsd, formatPercent, inDateRange } from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type InsurerRow = {
  insuranceId: string;
  name: string;
  billedUsd: number;
  collectedUsd: number;
  pendingUsd: number;
};

const STATUS_COLOR: Record<AccountsReceivableStatus, string> = {
  collected: CHART_COLORS.success,
  uncollected: CHART_COLORS.destructive,
  partially_collected: CHART_COLORS.warning,
  overcollected: CHART_COLORS.cyan,
};

const STATUS_ORDER: AccountsReceivableStatus[] = [
  'collected',
  'partially_collected',
  'uncollected',
  'overcollected',
];

export function ReportInsurerCollections() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({ from: sp.get('from') ?? '', to: sp.get('to') ?? '' }),
    [sp],
  );
  const [rows, setRows] = useState<AccountsReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    accountsReceivableGateway
      .list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setOverCap(res.metadata.total > REPORT_PAGE_SIZE);
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

  const inRange = useMemo(
    () => rows.filter((a) => inDateRange(a.createdAt, filters.from || undefined, filters.to || undefined)),
    [rows, filters.from, filters.to],
  );

  const byInsurer = useMemo<InsurerRow[]>(() => {
    const map = new Map<string, InsurerRow>();
    inRange.forEach((ar) => {
      const id = ar.insuranceId;
      if (!id) return;
      let row = map.get(id);
      if (!row) {
        row = {
          insuranceId: id,
          name: ar.insurance?.name ?? '—',
          billedUsd: 0,
          collectedUsd: 0,
          pendingUsd: 0,
        };
        map.set(id, row);
      }
      const billed = targetUsd(ar) ?? 0;
      const collected = collectedUsd(ar);
      row.billedUsd += billed;
      row.collectedUsd += collected;
      row.pendingUsd += Math.max(0, billed - collected);
    });
    return Array.from(map.values()).sort((a, b) => b.billedUsd - a.billedUsd);
  }, [inRange]);

  const byStatus = useMemo(() => {
    const counts = new Map<AccountsReceivableStatus, number>();
    inRange.forEach((a) => counts.set(a.status, (counts.get(a.status) ?? 0) + 1));
    return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
  }, [inRange]);

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    byInsurer.forEach((r) => {
      billed += r.billedUsd;
      collected += r.collectedUsd;
      pending += r.pendingUsd;
    });
    const rate = billed > 0 ? (collected / billed) * 100 : 0;
    return { billed, collected, pending, rate };
  }, [byInsurer]);

  const top = byInsurer.slice(0, 10);

  // ---- Chart data ----
  const billedVsCollected: ChartData<'bar'> = {
    labels: top.map((r) => r.name),
    datasets: [
      {
        label: 'Facturado',
        data: top.map((r) => r.billedUsd),
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
    labels: top.map((r) => r.name),
    datasets: [
      {
        label: '% cobranza',
        data: top.map((r) => (r.billedUsd > 0 ? (r.collectedUsd / r.billedUsd) * 100 : 0)),
        backgroundColor: top.map((r) => {
          const pct = r.billedUsd > 0 ? (r.collectedUsd / r.billedUsd) * 100 : 0;
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
    labels: byStatus.map((s) => STATUS_LABEL[s.status]),
    datasets: [
      {
        data: byStatus.map((s) => s.count),
        backgroundColor: byStatus.map((s) => STATUS_COLOR[s.status]),
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
            {
              icon: Wallet,
              tone: 'blue',
              label: 'Total facturado',
              value: formatUsd(totals.billed),
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Cobrado',
              value: formatUsd(totals.collected),
            },
            {
              icon: Clock4,
              tone: 'warning',
              label: 'Pendiente',
              value: formatUsd(totals.pending),
            },
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
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} cuentas. Aplicá filtros para acotar el reporte.
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
          title="Cuentas por estado"
          description="Distribución de la cartera"
          icon={PieChart}
          height={380}
          empty={noData && byStatus.length === 0}
          emptyText="Sin cuentas en el rango"
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
