import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  Activity,
  Workflow,
  PieChart,
  Stethoscope,
  ShieldCheck,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  type Order,
  type OrderStatus,
  type OrderType,
} from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ChartCard } from '../components/ChartCard';
import {
  CHART_COLORS,
  baseDoughnutOptions,
  paletteFor,
  withAlpha,
} from '../components/chartSetup';
import {
  formatMonth,
  formatNumber,
  formatPercent,
  inDateRange,
  monthBucket,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

const STATUS_COLOR: Record<OrderStatus, string> = {
  draft: CHART_COLORS.neutral,
  in_progress: CHART_COLORS.cyan,
  attended: CHART_COLORS.blue,
  report_issued: CHART_COLORS.warning,
  finalized: CHART_COLORS.success,
  cancelled: CHART_COLORS.destructive,
};

const STATUS_ORDER: OrderStatus[] = [
  'draft',
  'in_progress',
  'attended',
  'report_issued',
  'finalized',
  'cancelled',
];

const TYPE_ORDER: OrderType[] = ['cash', 'credit', 'insurance', 'cashea'];

const countOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', cornerRadius: 8, padding: 10 } },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, grid: { color: 'rgba(100, 116, 139, 0.12)' }, border: { display: false }, ticks: { precision: 0 } },
  },
};

const horizontalOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', cornerRadius: 8, padding: 10 } },
  scales: {
    x: { beginAtZero: true, grid: { color: 'rgba(100, 116, 139, 0.12)' }, border: { display: false }, ticks: { precision: 0 } },
    y: { grid: { display: false } },
  },
};

export function ReportOrdersAnalytics() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      type: (sp.get('type') ?? '') as '' | OrderType,
    }),
    [sp],
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    orderGateway
      .list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' })
      .then((res) => {
        if (cancelled) return;
        setOrders(res.data);
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

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (!inDateRange(o.orderDate, filters.from || undefined, filters.to || undefined)) return false;
        if (filters.type && o.type !== filters.type) return false;
        return true;
      }),
    [orders, filters.from, filters.to, filters.type],
  );

  const kpis = useMemo(() => {
    const total = filtered.length;
    const finalized = filtered.filter((o) => o.status === 'finalized').length;
    const cancelled = filtered.filter((o) => o.status === 'cancelled').length;
    const inProgress = filtered.filter((o) =>
      ['draft', 'in_progress', 'attended', 'report_issued'].includes(o.status),
    ).length;
    const rate = total > 0 ? (finalized / total) * 100 : 0;
    return { total, finalized, cancelled, inProgress, rate };
  }, [filtered]);

  const byStatus = useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    filtered.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
    return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
  }, [filtered]);

  const byType = useMemo(() => {
    const counts = new Map<OrderType, number>();
    filtered.forEach((o) => counts.set(o.type, (counts.get(o.type) ?? 0) + 1));
    return TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({ type: t, count: counts.get(t) ?? 0 }));
  }, [filtered]);

  const volumeByMonth = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((o) =>
      counts.set(monthBucket(o.orderDate), (counts.get(monthBucket(o.orderDate)) ?? 0) + 1),
    );
    const months = Array.from(counts.keys()).sort().slice(-12);
    return { months, data: months.map((m) => counts.get(m) ?? 0) };
  }, [filtered]);

  const topSpecialties = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((o) => {
      const name = o.specialty?.name ?? '—';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filtered]);

  const topInsurers = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((o) => {
      if (o.type !== 'insurance' || !o.insurance) return;
      counts.set(o.insurance.name, (counts.get(o.insurance.name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filtered]);

  // ---- Chart data ----
  const volumeData: ChartData<'bar'> = {
    labels: volumeByMonth.months.map((m) => formatMonth(m)),
    datasets: [
      {
        label: 'Órdenes',
        data: volumeByMonth.data,
        backgroundColor: withAlpha(CHART_COLORS.blue, 0.85),
        borderRadius: 6,
      },
    ],
  };

  const statusData: ChartData<'doughnut'> = {
    labels: byStatus.map((s) => ORDER_STATUS_LABEL[s.status]),
    datasets: [
      {
        data: byStatus.map((s) => s.count),
        backgroundColor: byStatus.map((s) => STATUS_COLOR[s.status]),
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  const typeData: ChartData<'doughnut'> = {
    labels: byType.map((t) => ORDER_TYPE_LABEL[t.type]),
    datasets: [
      {
        data: byType.map((t) => t.count),
        backgroundColor: paletteFor(byType.length),
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  const specialtyData: ChartData<'bar'> = {
    labels: topSpecialties.map(([name]) => name),
    datasets: [
      {
        label: 'Órdenes',
        data: topSpecialties.map(([, c]) => c),
        backgroundColor: withAlpha(CHART_COLORS.cyan, 0.85),
        borderRadius: 6,
      },
    ],
  };

  const insurerData: ChartData<'bar'> = {
    labels: topInsurers.map(([name]) => name),
    datasets: [
      {
        label: 'Órdenes',
        data: topInsurers.map(([, c]) => c),
        backgroundColor: withAlpha(CHART_COLORS.violet, 0.85),
        borderRadius: 6,
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

  const hasActiveFilters = !!filters.from || !!filters.to || !!filters.type;
  const clearFilters = () => setSp(new URLSearchParams(), { replace: true });
  const noData = !loading && !error;

  return (
    <ReportShell
      title="Análisis de órdenes"
      description="Demanda y desempeño operativo: volumen, mezcla y concentración por especialidad y aseguradora"
      kpis={
        <KpiRow
          items={[
            {
              icon: ClipboardList,
              tone: 'blue',
              label: 'Total de órdenes',
              value: formatNumber(kpis.total),
            },
            {
              icon: CheckCircle2,
              tone: 'success',
              label: 'Finalizadas',
              value: formatNumber(kpis.finalized),
              hint: `Tasa ${formatPercent(kpis.rate)}`,
            },
            {
              icon: Clock,
              tone: 'cyan',
              label: 'En proceso',
              value: formatNumber(kpis.inProgress),
            },
            {
              icon: XCircle,
              tone: 'destructive',
              label: 'Canceladas',
              value: formatNumber(kpis.cancelled),
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
            <>
              <DateRangeFilter
                from={filters.from || undefined}
                to={filters.to || undefined}
                onChange={(f, t) => updateParam({ from: f, to: t })}
              />
              <Select
                value={filters.type || 'all'}
                onValueChange={(v) => updateParam({ type: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  {Object.entries(ORDER_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
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
          Mostrando hasta {REPORT_PAGE_SIZE} órdenes. Aplica filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Volumen de órdenes por mes"
          description="Tendencia de demanda (últimos 12 meses)"
          icon={Activity}
          className="lg:col-span-2"
          height={300}
          empty={noData && volumeByMonth.months.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {volumeByMonth.months.length > 0 ? <Bar data={volumeData} options={countOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="Órdenes por estado"
          icon={Workflow}
          empty={noData && byStatus.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {byStatus.length > 0 ? <Doughnut data={statusData} options={baseDoughnutOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="Órdenes por tipo"
          icon={PieChart}
          empty={noData && byType.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {byType.length > 0 ? <Doughnut data={typeData} options={baseDoughnutOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="Top especialidades por volumen"
          description="Las 10 especialidades más solicitadas"
          icon={Stethoscope}
          height={340}
          empty={noData && topSpecialties.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {topSpecialties.length > 0 ? <Bar data={specialtyData} options={horizontalOptions} /> : null}
        </ChartCard>

        <ChartCard
          title="Top aseguradoras por volumen"
          description="Órdenes tipo seguro por compañía"
          icon={ShieldCheck}
          height={340}
          empty={noData && topInsurers.length === 0}
          emptyText="Sin órdenes de seguro en el rango"
        >
          {topInsurers.length > 0 ? <Bar data={insurerData} options={horizontalOptions} /> : null}
        </ChartCard>
      </div>
    </ReportShell>
  );
}
