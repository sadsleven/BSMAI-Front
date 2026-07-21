import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, Chart, Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  Clock4,
  LayoutDashboard,
  LineChart,
  PercentCircle,
  PieChart,
  PiggyBank,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Wallet,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
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
import {
  bsToUsd,
  taxPaymentToUsd,
  useUsdRate,
  type TaxPaymentLike,
} from '../../domain/useUsdRate';
import {
  reportsGateway,
  type ReportReceivableDebtorRow,
  type ReportReceivableRow,
  type ReceivableOrderState,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

type PaymentRow = { date: string; amountInUsd: number };

/** Últimos N meses (ascendente) presentes en los datos, hasta 12. */
function lastMonths(months: Set<string>, max = 12): string[] {
  return Array.from(months).sort().slice(-max);
}

// ---- Órdenes: colores/orden de estados y tipos ----
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

// ---- Cobranzas: estados de cartera ----
const AR_STATE_LABEL: Record<ReceivableOrderState, string> = {
  sin_lote: 'Por cobrar',
  uncollected: 'Por cobrar',
  partially_collected: 'Cobro parcial',
  collected: 'Cobrado',
  overcollected: 'Sobrecobrado',
};

const AR_STATE_COLOR: Record<ReceivableOrderState, string> = {
  sin_lote: CHART_COLORS.blue,
  uncollected: CHART_COLORS.destructive,
  partially_collected: CHART_COLORS.warning,
  collected: CHART_COLORS.success,
  overcollected: CHART_COLORS.cyan,
};

const AR_STATE_ORDER: ReceivableOrderState[] = [
  'collected',
  'partially_collected',
  'uncollected',
  'sin_lote',
  'overcollected',
];

/** Precedencia para colapsar las porciones de una orden mixta a UN estado:
 * gana el menos cobrado (si una porción está pendiente, la orden no está lista). */
const AR_STATE_PRECEDENCE: ReceivableOrderState[] = [
  'sin_lote',
  'uncollected',
  'partially_collected',
  'overcollected',
  'collected',
];

// ---- Opciones de charts (estáticas) ----
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

function SectionHeader({
  icon: Icon,
  title,
  description,
  right,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      {right}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="px-4 py-2 text-sm text-destructive border border-destructive-soft bg-destructive-soft rounded-lg">
      {message}
    </div>
  );
}

function OverCapNotice({ text }: { text: string }) {
  return (
    <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
      {text}
    </div>
  );
}

export function ReportExecutivePanel() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      type: (sp.get('type') ?? '') as '' | OrderType,
    }),
    [sp],
  );
  const { has } = usePermissions();
  const canOrders = has(PERMISSIONS.REPORTS.ORDERS_ANALYTICS_LIST);
  const canInsurers = has(PERMISSIONS.REPORTS.INSURER_COLLECTIONS_LIST);
  const usdRate = useUsdRate();

  // ==== Sección 1: flujo de caja (pagos reales AR/AP/impuestos) ====
  const [arPayments, setArPayments] = useState<PaymentRow[]>([]);
  const [apPayments, setApPayments] = useState<PaymentRow[]>([]);
  const [taxPayments, setTaxPayments] = useState<PaymentRow[]>([]);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashOverCap, setCashOverCap] = useState(false);

  // Los lotes no exponen filtro por fecha de pago en el BE: se trae la ventana
  // más reciente y el rango se aplica client-side sobre cada pago.
  useEffect(() => {
    let cancelled = false;
    setCashLoading(true);
    setCashError(null);
    Promise.all([
      accountsReceivableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      accountsPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      taxesPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([arRes, apRes, taxRes]) => {
        if (cancelled) return;
        setCashOverCap(
          arRes.metadata.total > REPORT_PAGE_SIZE ||
            apRes.metadata.total > REPORT_PAGE_SIZE ||
            taxRes.metadata.total > REPORT_PAGE_SIZE,
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
      })
      .catch((e) => {
        if (!cancelled) setCashError(getHttpErrorMessage(e, 'No se pudo cargar el flujo de caja'));
      })
      .finally(() => {
        if (!cancelled) setCashLoading(false);
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

  // ==== Sección 2: análisis de órdenes ====
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(canOrders);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersOverCap, setOrdersOverCap] = useState(false);

  // Los filtros viajan al BE: la ventana de REPORT_PAGE_SIZE se corta sobre el
  // conjunto YA filtrado (y ordenado por orderDate, la misma dimensión del
  // filtro) — así "aplica filtros para acotar" del aviso overCap sí funciona.
  useEffect(() => {
    if (!canOrders) return;
    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError(null);
    orderGateway
      .list({
        limit: REPORT_PAGE_SIZE,
        page: 1,
        sortBy: 'orderDate',
        sortDir: 'DESC',
        type: filters.type || undefined,
        orderDateFrom: filters.from || undefined,
        orderDateTo: filters.to || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setOrders(res.data);
        setOrdersOverCap(res.metadata.total > REPORT_PAGE_SIZE);
      })
      .catch((e) => {
        if (!cancelled) setOrdersError(getHttpErrorMessage(e, 'No se pudo cargar el análisis de órdenes'));
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canOrders, filters.from, filters.to, filters.type]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (!within(o.orderDate)) return false;
        if (filters.type && o.type !== filters.type) return false;
        return true;
      }),
    [orders, within, filters.type],
  );

  const orderKpis = useMemo(() => {
    const total = filteredOrders.length;
    const finalized = filteredOrders.filter((o) => o.status === 'finalized').length;
    const cancelled = filteredOrders.filter((o) => o.status === 'cancelled').length;
    const inProgress = filteredOrders.filter((o) =>
      ['draft', 'in_progress', 'attended', 'report_issued'].includes(o.status),
    ).length;
    const rate = total > 0 ? (finalized / total) * 100 : 0;
    return { total, finalized, cancelled, inProgress, rate };
  }, [filteredOrders]);

  const byStatus = useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    filteredOrders.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
    return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
  }, [filteredOrders]);

  const byType = useMemo(() => {
    const counts = new Map<OrderType, number>();
    filteredOrders.forEach((o) => counts.set(o.type, (counts.get(o.type) ?? 0) + 1));
    return TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({ type: t, count: counts.get(t) ?? 0 }));
  }, [filteredOrders]);

  const volumeByMonth = useMemo(() => {
    const counts = new Map<string, number>();
    filteredOrders.forEach((o) =>
      counts.set(monthBucket(o.orderDate), (counts.get(monthBucket(o.orderDate)) ?? 0) + 1),
    );
    const months = lastMonths(new Set(counts.keys()));
    return { months, data: months.map((m) => counts.get(m) ?? 0) };
  }, [filteredOrders]);

  const topSpecialties = useMemo(() => {
    const counts = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const name = o.specialty?.name ?? '—';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filteredOrders]);

  const topInsurers = useMemo(() => {
    const counts = new Map<string, number>();
    filteredOrders.forEach((o) => {
      if (o.type !== 'insurance' || !o.insurance) return;
      counts.set(o.insurance.name, (counts.get(o.insurance.name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filteredOrders]);

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

  const insurerVolumeData: ChartData<'bar'> = {
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

  // ==== Sección 3: cobranzas por aseguradora ====
  const [byInsurer, setByInsurer] = useState<ReportReceivableDebtorRow[]>([]);
  const [arOrders, setArOrders] = useState<ReportReceivableRow[]>([]);
  const [arLoading, setArLoading] = useState(canInsurers);
  const [arError, setArError] = useState<string | null>(null);

  useEffect(() => {
    if (!canInsurers) return;
    let cancelled = false;
    void (async () => {
      setArLoading(true);
      setArError(null);
      try {
        const query = { from: filters.from || undefined, to: filters.to || undefined };
        const [grouped, perOrder] = await Promise.all([
          reportsGateway.receivablesByDebtor({ ...query, groupBy: 'insurance' }),
          reportsGateway.receivables(query),
        ]);
        if (cancelled) return;
        setByInsurer(grouped.rows);
        setArOrders(perOrder.rows.filter((r) => r.debtorType === 'insurance'));
      } catch (e) {
        if (!cancelled) setArError(getHttpErrorMessage(e, 'No se pudo cargar cobranzas por aseguradora'));
      } finally {
        if (!cancelled) setArLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canInsurers, filters.from, filters.to]);

  // La dona cuenta ÓRDENES: una orden mixta emite 2 porciones (fija+indexada),
  // se colapsan a un solo estado por precedencia.
  const arByState = useMemo(() => {
    const perOrder = new Map<string, ReceivableOrderState>();
    arOrders.forEach((o) => {
      const prev = perOrder.get(o.orderId);
      if (
        prev === undefined ||
        AR_STATE_PRECEDENCE.indexOf(o.state) < AR_STATE_PRECEDENCE.indexOf(prev)
      ) {
        perOrder.set(o.orderId, o.state);
      }
    });
    const counts = new Map<ReceivableOrderState, number>();
    perOrder.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
    return AR_STATE_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [arOrders]);

  // Aseguradoras no indexadas facturan/cobran en Bs (tasa fija): esa porción se
  // convierte a USD con la tasa vigente para que entre a KPIs, charts y sort.
  const insurers = useMemo(
    () =>
      byInsurer
        .map((r) => ({
          ...r,
          billedUsd: r.targetUsd + bsToUsd(r.targetBs, usdRate),
          collectedTotalUsd: r.collectedUsd + bsToUsd(r.collectedBs, usdRate),
          pendingTotalUsd: r.pendingUsd + bsToUsd(r.pendingBs, usdRate),
        }))
        .sort((a, b) => b.billedUsd - a.billedUsd),
    [byInsurer, usdRate],
  );

  const arTotals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    let anyBs = false;
    insurers.forEach((r) => {
      billed += r.billedUsd;
      collected += r.collectedTotalUsd;
      pending += r.pendingTotalUsd;
      if (r.targetBs > 0 || r.collectedBs > 0 || r.pendingBs > 0) anyBs = true;
    });
    const rate = billed > 0 ? (collected / billed) * 100 : 0;
    return { billed, collected, pending, rate, anyBs };
  }, [insurers]);

  const topArInsurers = insurers.slice(0, 10);

  const billedVsCollected: ChartData<'bar'> = {
    labels: topArInsurers.map((r) => r.debtorName),
    datasets: [
      {
        label: 'Facturado',
        data: topArInsurers.map((r) => r.billedUsd),
        backgroundColor: withAlpha(CHART_COLORS.blue, 0.85),
        borderRadius: 5,
      },
      {
        label: 'Cobrado',
        data: topArInsurers.map((r) => r.collectedTotalUsd),
        backgroundColor: withAlpha(CHART_COLORS.success, 0.85),
        borderRadius: 5,
      },
    ],
  };

  const pctFor = (r: { billedUsd: number; collectedTotalUsd: number }) =>
    r.billedUsd > 0 ? (r.collectedTotalUsd / r.billedUsd) * 100 : 0;

  const collectionRate: ChartData<'bar'> = {
    labels: topArInsurers.map((r) => r.debtorName),
    datasets: [
      {
        label: '% cobranza',
        data: topArInsurers.map((r) => pctFor(r)),
        backgroundColor: topArInsurers.map((r) => {
          const pct = pctFor(r);
          if (pct >= 90) return withAlpha(CHART_COLORS.success, 0.85);
          if (pct >= 50) return withAlpha(CHART_COLORS.warning, 0.85);
          return withAlpha(CHART_COLORS.destructive, 0.85);
        }),
        borderRadius: 5,
      },
    ],
  };

  const arStateData: ChartData<'doughnut'> = {
    labels: arByState.map((s) => AR_STATE_LABEL[s.status]),
    datasets: [
      {
        data: arByState.map((s) => s.count),
        backgroundColor: arByState.map((s) => AR_STATE_COLOR[s.status]),
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  // ==== Filtros compartidos (URL) ====
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

  const cashNoData = !cashLoading && !cashError;
  const ordersNoData = !ordersLoading && !ordersError;
  const arNoData = !arLoading && !arError;

  return (
    <ReportShell
      title="Panel ejecutivo"
      description="Vista gerencial en una sola página: flujo de caja, análisis de órdenes y cobranzas por aseguradora"
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

      {/* ==== Sección 1: Resumen ejecutivo ==== */}
      <section className="space-y-4">
        <SectionHeader
          icon={LayoutDashboard}
          title="Resumen ejecutivo"
          description="Flujo de caja real: cobros, pagos a proveedores e impuestos (USD)"
        />
        {cashError ? <InlineError message={cashError} /> : null}
        {cashOverCap ? (
          <OverCapNotice
            text={`Mostrando hasta ${REPORT_PAGE_SIZE} registros por fuente. Aplica filtros para acotar el panel.`}
          />
        ) : null}
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
        <ChartCard
          title="Ingresos vs Egresos por mes"
          description="Cobros, pagos a proveedores e impuestos (USD)"
          icon={CalendarRange}
          height={320}
          empty={cashNoData && cashFlow.months.length === 0}
          emptyText="Sin pagos registrados en el rango"
        >
          {cashFlow.months.length > 0 ? (
            <Chart type="bar" data={cashFlowData} options={cashFlowOptions} />
          ) : null}
        </ChartCard>
      </section>

      {/* ==== Sección 2: Análisis de órdenes ==== */}
      {canOrders ? (
        <section className="space-y-4 border-t pt-6">
          <SectionHeader
            icon={LineChart}
            title="Análisis de órdenes"
            description="Demanda y desempeño operativo: volumen, mezcla y concentración por especialidad y aseguradora"
            right={
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
            }
          />
          {ordersError ? <InlineError message={ordersError} /> : null}
          {ordersOverCap ? (
            <OverCapNotice
              text={`Mostrando hasta ${REPORT_PAGE_SIZE} órdenes. Aplica filtros para acotar el reporte.`}
            />
          ) : null}
          <KpiRow
            items={[
              {
                icon: ClipboardList,
                tone: 'blue',
                label: 'Total de órdenes',
                value: formatNumber(orderKpis.total),
              },
              {
                icon: CheckCircle2,
                tone: 'success',
                label: 'Finalizadas',
                value: formatNumber(orderKpis.finalized),
                hint: `Tasa ${formatPercent(orderKpis.rate)}`,
              },
              {
                icon: Clock,
                tone: 'cyan',
                label: 'En proceso',
                value: formatNumber(orderKpis.inProgress),
              },
              {
                icon: XCircle,
                tone: 'destructive',
                label: 'Canceladas',
                value: formatNumber(orderKpis.cancelled),
              },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Volumen de órdenes por mes"
              description="Tendencia de demanda (últimos 12 meses)"
              icon={Activity}
              className="lg:col-span-2"
              height={300}
              empty={ordersNoData && volumeByMonth.months.length === 0}
              emptyText="Sin órdenes en el rango"
            >
              {volumeByMonth.months.length > 0 ? <Bar data={volumeData} options={countOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="Órdenes por estado"
              icon={Workflow}
              empty={ordersNoData && byStatus.length === 0}
              emptyText="Sin órdenes en el rango"
            >
              {byStatus.length > 0 ? <Doughnut data={statusData} options={baseDoughnutOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="Órdenes por tipo"
              icon={PieChart}
              empty={ordersNoData && byType.length === 0}
              emptyText="Sin órdenes en el rango"
            >
              {byType.length > 0 ? <Doughnut data={typeData} options={baseDoughnutOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="Top especialidades por volumen"
              description="Las 10 especialidades más solicitadas"
              icon={Stethoscope}
              height={340}
              empty={ordersNoData && topSpecialties.length === 0}
              emptyText="Sin órdenes en el rango"
            >
              {topSpecialties.length > 0 ? <Bar data={specialtyData} options={horizontalOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="Top aseguradoras por volumen"
              description="Órdenes tipo seguro por compañía"
              icon={ShieldCheck}
              height={340}
              empty={ordersNoData && topInsurers.length === 0}
              emptyText="Sin órdenes de seguro en el rango"
            >
              {topInsurers.length > 0 ? <Bar data={insurerVolumeData} options={horizontalOptions} /> : null}
            </ChartCard>
          </div>
        </section>
      ) : null}

      {/* ==== Sección 3: Cobranzas por aseguradora ==== */}
      {canInsurers ? (
        <section className="space-y-4 border-t pt-6">
          <SectionHeader
            icon={PiggyBank}
            title="Cobranzas por aseguradora"
            description="Salud de la cartera por cobrar: facturación, recaudo y morosidad por compañía de seguros"
          />
          {arError ? <InlineError message={arError} /> : null}
          <KpiRow
            items={[
              {
                icon: Wallet,
                tone: 'blue',
                label: 'Total facturado',
                value: formatUsd(arTotals.billed),
                hint: arTotals.anyBs ? 'Incluye porción Bs (tasa fija) a tasa vigente' : undefined,
              },
              { icon: TrendingUp, tone: 'success', label: 'Cobrado', value: formatUsd(arTotals.collected) },
              { icon: Clock4, tone: 'warning', label: 'Pendiente', value: formatUsd(arTotals.pending) },
              {
                icon: PercentCircle,
                tone: 'cyan',
                label: '% Cobranza',
                value: formatPercent(arTotals.rate),
                hint: 'Cobrado sobre facturado',
              },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard
              title="Facturado vs Cobrado por aseguradora"
              description="Top 10 por monto facturado (USD)"
              icon={BarChart3}
              height={380}
              className="lg:col-span-2"
              empty={arNoData && topArInsurers.length === 0}
              emptyText="Sin cuentas por cobrar en el rango"
            >
              {topArInsurers.length > 0 ? <Bar data={billedVsCollected} options={billedVsCollectedOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="Órdenes por estado"
              description="Distribución de la cartera (incluye por cobrar)"
              icon={PieChart}
              height={380}
              empty={arNoData && arByState.length === 0}
              emptyText="Sin órdenes en el rango"
            >
              {arByState.length > 0 ? <Doughnut data={arStateData} options={baseDoughnutOptions} /> : null}
            </ChartCard>

            <ChartCard
              title="% de cobranza por aseguradora"
              description="Verde ≥90% · Ámbar ≥50% · Rojo <50%"
              icon={PercentCircle}
              height={380}
              className="lg:col-span-3"
              empty={arNoData && topArInsurers.length === 0}
              emptyText="Sin cuentas por cobrar en el rango"
            >
              {topArInsurers.length > 0 ? <Bar data={collectionRate} options={collectionRateOptions} /> : null}
            </ChartCard>
          </div>
        </section>
      ) : null}
    </ReportShell>
  );
}
