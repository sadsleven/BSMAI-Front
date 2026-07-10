import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  PercentCircle,
  Activity,
  CalendarRange,
} from 'lucide-react';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { taxesPayableGateway } from '@/modules/taxes-payable/infrastructure/taxesPayableGateway';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import type { Order } from '@/modules/orders/domain/models/order';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ChartCard } from '../components/ChartCard';
import { CHART_COLORS, withAlpha } from '../components/chartSetup';
import {
  formatUsd,
  formatMonth,
  formatNumber,
  formatPercent,
  inDateRange,
  monthBucket,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { taxPaymentToUsd, useUsdRate, type TaxPaymentLike } from '../../domain/useUsdRate';
import { getHttpErrorMessage } from '@/lib/api';

type PaymentRow = { date: string; amountInUsd: number };

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
        // Pagos SENIAT: conversión histórica per-pago (USD directo o tasa
        // snapshot del pago); tasa vigente sólo como fallback.
        const toPaymentsBs = (rows: { payments?: ({ paymentDate: string } & TaxPaymentLike)[] }[]) =>
          rows.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: taxPaymentToUsd(p, usdRate),
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
  // Los KPIs suman TODO el rango filtrado; el chart recorta a los últimos 12
  // meses con datos (los totales no dependen del recorte).
  const cashFlow = useMemo(() => {
    const income = new Map<string, number>();
    const expense = new Map<string, number>();
    let totalIncome = 0;
    let totalExpense = 0;
    const add = (m: Map<string, number>, key: string, v: number) =>
      m.set(key, (m.get(key) ?? 0) + v);
    arPayments.forEach((p) => {
      if (!within(p.date)) return;
      add(income, monthBucket(p.date), p.amountInUsd);
      totalIncome += p.amountInUsd;
    });
    const addExpense = (p: PaymentRow) => {
      if (!within(p.date)) return;
      add(expense, monthBucket(p.date), p.amountInUsd);
      totalExpense += p.amountInUsd;
    };
    apPayments.forEach(addExpense);
    taxPayments.forEach(addExpense);
    const allMonths = new Set<string>([...income.keys(), ...expense.keys()]);
    const months = lastMonths(allMonths);
    const incomeArr = months.map((m) => income.get(m) ?? 0);
    const expenseArr = months.map((m) => expense.get(m) ?? 0);
    const netArr = months.map((_, i) => incomeArr[i] - expenseArr[i]);
    const net = totalIncome - totalExpense;
    const margin = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
    return { months, incomeArr, expenseArr, netArr, totalIncome, totalExpense, net, margin };
  }, [arPayments, apPayments, taxPayments, within]);

  // ---- Órdenes filtradas por orderDate ----
  const ordersInRange = useMemo(
    () => orders.filter((o) => within(o.orderDate)),
    [orders, within],
  );

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
      description="Vista gerencial: flujo de caja real y volumen de órdenes para la toma de decisiones"
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
          title="Volumen de órdenes por mes"
          description={`${formatNumber(volumeByMonth.data.reduce((s, v) => s + v, 0))} órdenes en los meses graficados (últimos 12 con datos)`}
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
