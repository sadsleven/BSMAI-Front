import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chart, Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  PercentCircle,
  Activity,
  PieChart,
  CalendarRange,
  Workflow,
} from 'lucide-react';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { taxesPayableGateway } from '@/modules/taxes-payable/infrastructure/taxesPayableGateway';
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
  formatUsd,
  formatMonth,
  formatNumber,
  formatPercent,
  inDateRange,
  monthBucket,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { bsToUsd, useUsdRate } from '../../domain/useUsdRate';
import { getHttpErrorMessage } from '@/lib/api';

type PaymentRow = { date: string; amountInUsd: number };

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

/** Últimos N meses (ascendente) presentes en los datos, hasta 12. */
function lastMonths(months: Set<string>, max = 12): string[] {
  return Array.from(months).sort().slice(-max);
}

export function ReportExecutivePanel() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({ from: sp.get('from') ?? '', to: sp.get('to') ?? '' }),
    [sp],
  );
  const [arPayments, setArPayments] = useState<PaymentRow[]>([]);
  const [apPayments, setApPayments] = useState<PaymentRow[]>([]);
  const [taxPayments, setTaxPayments] = useState<PaymentRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsReceivableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      accountsPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      taxesPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      orderGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([arRes, apRes, taxRes, ordRes]) => {
        if (cancelled) return;
        setOverCap(
          arRes.metadata.total > REPORT_PAGE_SIZE ||
            apRes.metadata.total > REPORT_PAGE_SIZE ||
            taxRes.metadata.total > REPORT_PAGE_SIZE ||
            ordRes.metadata.total > REPORT_PAGE_SIZE,
        );
        const toPaymentsUsd = (rows: { payments?: { paymentDate: string; amountInUsd: string | number }[] }[]) =>
          rows.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: Number(p.amountInUsd || 0),
            })),
          );
        const toPaymentsBs = (rows: { payments?: { paymentDate: string; amountInBs: string | number }[] }[]) =>
          rows.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: bsToUsd(p.amountInBs, usdRate),
            })),
          );
        setArPayments(toPaymentsUsd(arRes.data));
        setApPayments(toPaymentsUsd(apRes.data));
        setTaxPayments(toPaymentsBs(taxRes.data));
        setOrders(ordRes.data);
      })
      .catch((e) => {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el panel'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usdRate]);

  const within = useMemo(
    () => (d: string | null | undefined) =>
      inDateRange(d, filters.from || undefined, filters.to || undefined),
    [filters.from, filters.to],
  );

  // ---- Flujo de caja por mes (USD, pagos reales) ----
  const cashFlow = useMemo(() => {
    const income = new Map<string, number>();
    const expense = new Map<string, number>();
    const add = (m: Map<string, number>, key: string, v: number) =>
      m.set(key, (m.get(key) ?? 0) + v);
    arPayments.forEach((p) => within(p.date) && add(income, monthBucket(p.date), p.amountInUsd));
    apPayments.forEach((p) => within(p.date) && add(expense, monthBucket(p.date), p.amountInUsd));
    taxPayments.forEach((p) => within(p.date) && add(expense, monthBucket(p.date), p.amountInUsd));
    const allMonths = new Set<string>([...income.keys(), ...expense.keys()]);
    const months = lastMonths(allMonths);
    const incomeArr = months.map((m) => income.get(m) ?? 0);
    const expenseArr = months.map((m) => expense.get(m) ?? 0);
    const netArr = months.map((_, i) => incomeArr[i] - expenseArr[i]);
    const totalIncome = incomeArr.reduce((s, v) => s + v, 0);
    const totalExpense = expenseArr.reduce((s, v) => s + v, 0);
    const net = totalIncome - totalExpense;
    const margin = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
    return { months, incomeArr, expenseArr, netArr, totalIncome, totalExpense, net, margin };
  }, [arPayments, apPayments, taxPayments, within]);

  // ---- Órdenes filtradas por orderDate ----
  const ordersInRange = useMemo(
    () => orders.filter((o) => within(o.orderDate)),
    [orders, within],
  );

  const byStatus = useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    ordersInRange.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
    return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [ordersInRange]);

  const byType = useMemo(() => {
    const counts = new Map<OrderType, number>();
    ordersInRange.forEach((o) => counts.set(o.type, (counts.get(o.type) ?? 0) + 1));
    return TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({
      type: t,
      count: counts.get(t) ?? 0,
    }));
  }, [ordersInRange]);

  const volumeByMonth = useMemo(() => {
    const counts = new Map<string, number>();
    ordersInRange.forEach((o) =>
      counts.set(monthBucket(o.orderDate), (counts.get(monthBucket(o.orderDate)) ?? 0) + 1),
    );
    const months = lastMonths(new Set(counts.keys()));
    return { months, data: months.map((m) => counts.get(m) ?? 0) };
  }, [ordersInRange]);

  // ---- Chart data ----
  const cashFlowData: ChartData<'bar' | 'line'> = {
    labels: cashFlow.months.map((m) => formatMonth(m)),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Ingresos',
        data: cashFlow.incomeArr,
        backgroundColor: withAlpha(CHART_COLORS.success, 0.85),
        borderRadius: 6,
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'Egresos',
        data: cashFlow.expenseArr,
        backgroundColor: withAlpha(CHART_COLORS.destructive, 0.85),
        borderRadius: 6,
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Resultado neto',
        data: cashFlow.netArr,
        borderColor: CHART_COLORS.blue,
        backgroundColor: withAlpha(CHART_COLORS.blue, 0.15),
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: CHART_COLORS.blue,
        fill: false,
        order: 1,
      },
    ],
  };

  const cashFlowOptions: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatUsd(Number(ctx.parsed.y))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(100, 116, 139, 0.12)' },
        border: { display: false },
        ticks: { callback: (v) => formatUsd(Number(v)) },
      },
    },
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

  const volumeOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', cornerRadius: 8, padding: 10 } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: 'rgba(100, 116, 139, 0.12)' }, border: { display: false }, ticks: { precision: 0 } },
    },
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
      title="Panel ejecutivo"
      description="Vista gerencial: flujo de caja real y distribución de órdenes para la toma de decisiones"
      kpis={
        <KpiRow
          items={[
            {
              icon: ArrowDownCircle,
              tone: 'success',
              label: 'Ingresos',
              value: formatUsd(cashFlow.totalIncome),
              hint: 'Cobros recibidos',
            },
            {
              icon: ArrowUpCircle,
              tone: 'destructive',
              label: 'Egresos',
              value: formatUsd(cashFlow.totalExpense),
              hint: 'Proveedores + impuestos',
            },
            {
              icon: BarChart3,
              tone: cashFlow.net >= 0 ? 'blue' : 'destructive',
              label: 'Resultado neto',
              value: formatUsd(cashFlow.net),
            },
            {
              icon: PercentCircle,
              tone: 'cyan',
              label: 'Margen',
              value: formatPercent(cashFlow.margin),
              hint: 'Neto sobre ingresos',
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
          Mostrando hasta {REPORT_PAGE_SIZE} registros por fuente. Aplica filtros para acotar el panel.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Ingresos vs Egresos por mes"
          description="Cobros, pagos a proveedores e impuestos (USD)"
          icon={CalendarRange}
          height={320}
          className="lg:col-span-2"
          empty={noData && cashFlow.months.length === 0}
          emptyText="Sin pagos registrados en el rango"
        >
          {cashFlow.months.length > 0 ? (
            <Chart type="bar" data={cashFlowData} options={cashFlowOptions} />
          ) : null}
        </ChartCard>

        <ChartCard
          title="Órdenes por estado"
          description="Distribución del flujo de órdenes"
          icon={Workflow}
          empty={noData && byStatus.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {byStatus.length > 0 ? (
            <Doughnut data={statusData} options={baseDoughnutOptions} />
          ) : null}
        </ChartCard>

        <ChartCard
          title="Órdenes por tipo"
          description="Contado, crédito, seguro y Cashea"
          icon={PieChart}
          empty={noData && byType.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {byType.length > 0 ? (
            <Doughnut data={typeData} options={baseDoughnutOptions} />
          ) : null}
        </ChartCard>

        <ChartCard
          title="Volumen de órdenes por mes"
          description={`${formatNumber(ordersInRange.length)} órdenes en el rango`}
          icon={Activity}
          className="lg:col-span-2"
          empty={noData && volumeByMonth.months.length === 0}
          emptyText="Sin órdenes en el rango"
        >
          {volumeByMonth.months.length > 0 ? (
            <Chart type="bar" data={volumeData as ChartData<'bar' | 'line'>} options={volumeOptions as ChartOptions<'bar' | 'line'>} />
          ) : null}
        </ChartCard>
      </div>
    </ReportShell>
  );
}
