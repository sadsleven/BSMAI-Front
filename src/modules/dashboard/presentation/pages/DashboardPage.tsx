import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarClock,
  FileText,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import { dashboardGateway } from '@/modules/dashboard/infrastructure/dashboardGateway';
import {
  ORDER_STATUS_LABEL,
  holderDisplayName,
  type Order,
  type OrderStatus,
} from '@/modules/orders/domain/models/order';

type Trend = 'up' | 'down' | 'neutral';
type Tone = 'blue' | 'cyan' | 'amber' | 'green';

const TONE_CLASS: Record<Tone, string> = {
  blue: 'bg-brand-blue-soft text-brand-blue-strong',
  cyan: 'bg-brand-cyan-soft text-brand-cyan-strong',
  amber: 'bg-warning-soft text-warning',
  green: 'bg-success-soft text-success',
};

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatDateEs(date: Date) {
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATUS_PILL: Record<OrderStatus, { cls: string; dot: string }> = {
  draft: { cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  in_progress: { cls: 'bg-brand-blue-soft text-brand-blue-strong', dot: 'bg-brand-blue' },
  attended: { cls: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  report_issued: { cls: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  finalized: { cls: 'bg-success-soft text-success', dot: 'bg-success' },
  cancelled: { cls: 'bg-destructive-soft text-destructive', dot: 'bg-destructive' },
};

function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS_PILL[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        s.cls,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

type KpiCardProps = {
  label: string;
  value: string | null;
  delta?: string;
  trend?: Trend;
  icon: typeof UserRound;
  tone: Tone;
  loading: boolean;
};

function KpiCard({ label, value, delta, trend = 'neutral', icon: Icon, tone, loading }: KpiCardProps) {
  const Trending = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Activity;
  const trendColor =
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className="bg-card rounded-xl border shadow-xs p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', TONE_CLASS[tone])}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      {loading || value === null ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <div className="text-[26px] font-bold tracking-[-0.02em] leading-none">{value}</div>
      )}
      {loading ? (
        <Skeleton className="h-3 w-24" />
      ) : delta ? (
        <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
          <Trending className="w-3.5 h-3.5" />
          {delta}
        </div>
      ) : (
        <div className="h-3" />
      )}
    </div>
  );
}

function useCount(
  enabled: boolean,
  fetcher: () => Promise<{ count: number }>,
) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((r) => {
        if (!cancelled) setValue(r.count);
      })
      .catch(() => {
        if (!cancelled) setValue(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { value, loading };
}

function useBilledMonthUsd(enabled: boolean) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    dashboardGateway
      .billedMonthUsd()
      .then((r) => {
        if (!cancelled) setValue(r.amount);
      })
      .catch(() => {
        if (!cancelled) setValue(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [enabled]);
  return { value, loading };
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function useRecentOrders(enabled: boolean) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    orderGateway
      .list({ page: 1, limit: 5, sortBy: 'createdAt', sortDir: 'DESC' })
      .then((r) => {
        if (!cancelled) setOrders(r.data);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [enabled]);
  return { orders, loading };
}

function useUpcomingAppointments(enabled: boolean) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    orderGateway
      .list({
        page: 1,
        limit: 20,
        appointmentDateFrom: todayIso(),
        sortBy: 'appointmentDate',
        sortDir: 'ASC',
      })
      .then((r) => {
        if (cancelled) return;
        const nowMs = Date.now();
        const future = r.data
          .filter((o) => {
            const t = new Date(o.appointmentDate).getTime();
            return Number.isFinite(t) && t >= nowMs;
          })
          .sort(
            (a, b) =>
              new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime(),
          )
          .slice(0, 5);
        setOrders(future);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [enabled]);
  return { orders, loading };
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function serviceLabel(o: Order): string {
  const sts = (o.serviceTypes ?? []).map((s) => s.name).join(' · ');
  if (sts) return sts;
  return o.specialty?.name ?? '—';
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { has } = usePermissions();

  const canListPatients = has(PERMISSIONS.PATIENTS.LIST);
  const canListOrders = has(PERMISSIONS.ORDERS.LIST);
  const canSeeBilled =
    has(PERMISSIONS.ACCOUNTS_PAYABLE.LIST) && has(PERMISSIONS.ACCOUNTS_RECEIVABLE.LIST);

  const now = new Date();
  const firstName = user?.firstName ?? '';
  const greeting = greetingFor(now);
  const dateLabel = formatDateEs(now);

  const patients = useCount(canListPatients, dashboardGateway.patientsActiveCount);
  const todayAppts = useCount(canListOrders, dashboardGateway.ordersTodayCount);
  const pending = useCount(canListOrders, dashboardGateway.ordersPendingCount);
  const billed = useBilledMonthUsd(canSeeBilled);
  const recent = useRecentOrders(canListOrders);
  const upcoming = useUpcomingAppointments(canListOrders);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Resumen del día · {dateLabel}</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {canListPatients ? (
          <KpiCard
            label="Pacientes activos"
            value={patients.value === null ? null : patients.value.toLocaleString('es-VE')}
            icon={UserRound}
            tone="blue"
            loading={patients.loading}
          />
        ) : null}
        {canListOrders ? (
          <KpiCard
            label="Citas hoy"
            value={todayAppts.value === null ? null : todayAppts.value.toLocaleString('es-VE')}
            icon={CalendarClock}
            tone="cyan"
            loading={todayAppts.loading}
          />
        ) : null}
        {canListOrders ? (
          <KpiCard
            label="Órdenes pendientes"
            value={pending.value === null ? null : pending.value.toLocaleString('es-VE')}
            icon={FileText}
            tone="amber"
            loading={pending.loading}
          />
        ) : null}
        {canSeeBilled ? (
          <KpiCard
            label="Facturado mes"
            value={billed.value === null ? null : `$ ${formatUsd(billed.value)}`}
            icon={Receipt}
            tone="green"
            loading={billed.loading}
          />
        ) : null}
      </div>

      {/* Secondary layout */}
      {canListOrders ? (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          {/* Recent orders */}
          <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold">Órdenes recientes</h3>
                <p className="text-xs text-muted-foreground">Últimas 5 órdenes generadas</p>
              </div>
              <Link to="/orders">
                <Button variant="ghost" size="sm" className="text-brand-blue-strong">
                  Ver todas
                </Button>
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[oklch(0.985_0.003_250)] text-left">
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    N° orden
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Paciente
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`sk-r-${i}`} className="border-t">
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-28 mt-1.5" />
                        </td>
                        <td className="px-5 py-3">
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Skeleton className="h-4 w-16 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : recent.orders.length === 0
                    ? (
                        <tr className="border-t">
                          <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                            Aún no hay órdenes.
                          </td>
                        </tr>
                      )
                    : recent.orders.map((o) => (
                        <tr key={o.id} className="border-t hover:bg-[oklch(0.985_0.003_250)]">
                          <td className="px-5 py-3 font-mono text-xs text-foreground">
                            {o.orderNumber}
                          </td>
                          <td className="px-5 py-3">
                            <div className="font-medium">{holderDisplayName(o.patient)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {serviceLabel(o)}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <OrderStatusPill status={o.status} />
                          </td>
                          <td className="px-5 py-3 text-right font-semibold font-mono text-xs">
                            {Number(o.priceAmount).toFixed(2)} {o.priceCurrency}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>

          {/* Upcoming appointments */}
          <div className="bg-card rounded-xl border shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b">
              <h3 className="text-[15px] font-semibold">Próximas citas</h3>
              <p className="text-xs text-muted-foreground">Desde hoy</p>
            </div>
            <ul className="divide-y flex-1">
              {upcoming.loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <li key={`sk-u-${i}`} className="flex items-center gap-3 px-5 py-3">
                      <Skeleton className="w-[56px] h-[56px] rounded-lg" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </li>
                  ))
                : upcoming.orders.length === 0
                  ? (
                      <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                        Sin citas próximas.
                      </li>
                    )
                  : upcoming.orders.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-[oklch(0.985_0.003_250)]"
                      >
                        <div className="w-[56px] h-[56px] rounded-lg bg-brand-blue-soft text-brand-blue-strong flex flex-col items-center justify-center shrink-0 leading-tight">
                          <span className="text-[13px] font-bold">{formatHour(o.appointmentDate)}</span>
                          <span className="text-[10px] font-medium uppercase tracking-[0.04em] opacity-80">
                            {formatShortDate(o.appointmentDate)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {holderDisplayName(o.patient)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {serviceLabel(o)}
                          </div>
                        </div>
                      </li>
                    ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
