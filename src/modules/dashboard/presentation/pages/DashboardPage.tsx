import { useMemo } from 'react';
import {
  Activity,
  CalendarClock,
  Download,
  FileText,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { cn } from '@/lib/utils';

type Trend = 'up' | 'down' | 'neutral';

type KPI = {
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  icon: typeof UserRound;
  /** color tint key for icon container */
  tone: 'blue' | 'cyan' | 'amber' | 'green';
};

type Order = {
  code: string;
  patient: string;
  service: string;
  status: 'paid' | 'pending' | 'cancelled';
  amount: string;
};

type Appointment = {
  hour: string;
  patient: string;
  type: string;
  status: 'confirmed' | 'pending' | 'cancelled';
};

const TONE_CLASS: Record<KPI['tone'], string> = {
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

const KPIS: KPI[] = [
  {
    label: 'Pacientes activos',
    value: '1.284',
    delta: '+12 esta semana',
    trend: 'up',
    icon: UserRound,
    tone: 'blue',
  },
  {
    label: 'Citas hoy',
    value: '38',
    delta: '+4 vs ayer',
    trend: 'up',
    icon: CalendarClock,
    tone: 'cyan',
  },
  {
    label: 'Órdenes pendientes',
    value: '17',
    delta: '−3 vs ayer',
    trend: 'down',
    icon: FileText,
    tone: 'amber',
  },
  {
    label: 'Facturado mes',
    value: '$ 4.82M',
    delta: '+8.2% vs mes ant.',
    trend: 'up',
    icon: Receipt,
    tone: 'green',
  },
];

const ORDERS: Order[] = [
  {
    code: 'OR-2841',
    patient: 'María González',
    service: 'Resonancia magnética',
    status: 'paid',
    amount: '$ 38.500',
  },
  {
    code: 'OR-2840',
    patient: 'Carlos Pérez',
    service: 'Laboratorio completo',
    status: 'pending',
    amount: '$ 12.200',
  },
  {
    code: 'OR-2839',
    patient: 'Lucía Ramírez',
    service: 'Consulta cardiología',
    status: 'paid',
    amount: '$ 9.800',
  },
  {
    code: 'OR-2838',
    patient: 'Diego Romero',
    service: 'Radiografía tórax',
    status: 'cancelled',
    amount: '$ 6.400',
  },
  {
    code: 'OR-2837',
    patient: 'Sofía Álvarez',
    service: 'Ecografía abdominal',
    status: 'paid',
    amount: '$ 14.900',
  },
];

const APPOINTMENTS: Appointment[] = [
  { hour: '14:30', patient: 'Mariano Vega', type: 'Cardiología · seguimiento', status: 'confirmed' },
  { hour: '15:00', patient: 'Renata Torres', type: 'Ecografía obstétrica', status: 'confirmed' },
  { hour: '15:45', patient: 'Pablo Aguilar', type: 'Consulta clínica', status: 'pending' },
  { hour: '16:30', patient: 'Inés Ferrari', type: 'Laboratorio control', status: 'confirmed' },
  { hour: '17:00', patient: 'Tomás Maldonado', type: 'Endocrinología', status: 'cancelled' },
];

function StatusPill({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'destructive' | 'cyan';
  label: string;
}) {
  const cls =
    tone === 'success'
      ? 'bg-success-soft text-success'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning'
        : tone === 'destructive'
          ? 'bg-destructive-soft text-destructive'
          : 'bg-brand-cyan-soft text-brand-cyan-strong';
  const dot =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'destructive'
          ? 'bg-destructive'
          : 'bg-brand-cyan';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        cls,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const now = useMemo(() => new Date(), []);

  const firstName = user?.firstName ?? '';
  const greeting = greetingFor(now);
  const dateLabel = formatDateEs(now);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva orden
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          const Trending =
            kpi.trend === 'up'
              ? TrendingUp
              : kpi.trend === 'down'
                ? TrendingDown
                : Activity;
          const trendColor =
            kpi.trend === 'up'
              ? 'text-success'
              : kpi.trend === 'down'
                ? 'text-destructive'
                : 'text-muted-foreground';
          return (
            <div
              key={kpi.label}
              className="bg-card rounded-xl border shadow-xs p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {kpi.label}
                </span>
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center',
                    TONE_CLASS[kpi.tone],
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </div>
              </div>
              <div className="text-[26px] font-bold tracking-[-0.02em] leading-none">
                {kpi.value}
              </div>
              <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
                <Trending className="w-3.5 h-3.5" />
                {kpi.delta}
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Recent orders */}
        <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold">Órdenes recientes</h3>
              <p className="text-xs text-muted-foreground">Últimas 5 órdenes generadas</p>
            </div>
            <Button variant="ghost" size="sm" className="text-brand-blue-strong">
              Ver todas
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[oklch(0.985_0.003_250)] text-left">
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Código
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
              {ORDERS.map((o) => (
                <tr key={o.code} className="border-t hover:bg-[oklch(0.985_0.003_250)]">
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{o.code}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium">{o.patient}</div>
                    <div className="text-xs text-muted-foreground truncate">{o.service}</div>
                  </td>
                  <td className="px-5 py-3">
                    {o.status === 'paid' ? (
                      <StatusPill tone="success" label="Pagada" />
                    ) : o.status === 'pending' ? (
                      <StatusPill tone="warning" label="Pendiente" />
                    ) : (
                      <StatusPill tone="destructive" label="Cancelada" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{o.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Upcoming appointments */}
        <div className="bg-card rounded-xl border shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b">
            <h3 className="text-[15px] font-semibold">Próximas citas</h3>
            <p className="text-xs text-muted-foreground">Hoy</p>
          </div>
          <ul className="divide-y flex-1">
            {APPOINTMENTS.map((a) => (
              <li
                key={a.hour + a.patient}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[oklch(0.985_0.003_250)]"
              >
                <div className="w-[42px] h-[42px] rounded-lg bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center text-[13px] font-bold shrink-0">
                  {a.hour}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{a.patient}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.type}</div>
                </div>
                {a.status === 'confirmed' ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Confirmada
                  </Badge>
                ) : a.status === 'pending' ? (
                  <Badge variant="outline" className="text-[10px]">
                    Pendiente
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    Cancelada
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
