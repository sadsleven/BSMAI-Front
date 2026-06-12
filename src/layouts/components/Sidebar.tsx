import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Shield,
  LogOut,
  Stethoscope,
  UserRound,
  BriefcaseMedical,
  Hospital,
  Shield as ShieldIcon,
  ShieldCheck,
  Activity,
  FileText,
  Briefcase,
  TrendingUp,
  Calculator,
  Building,
  ClipboardList,
  Wallet,
  HandCoins,
  Receipt,
  ChevronDown,
  Coins,
  Banknote,
  BarChart3,
  UserCog,
  Clock4,
  ArrowDownCircle,
  ArrowUpCircle,
  Workflow,
  PieChart,
  LayoutDashboard,
  LineChart,
  PiggyBank,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getFullName } from '@/modules/auth/domain/models/authUser';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  show: boolean;
  badge?: number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export type SidebarContentProps = {
  /** Called after a nav link is clicked (used to close mobile drawer). */
  onNavigate?: () => void;
};

/** Inner UI of the sidebar — reusable in desktop aside and mobile drawer. */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { has } = usePermissions();

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    notify.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };

  // Proveedores (doctor/centro) no ven Inicio — el dashboard redirige a /orders.
  const isProvider = !!user?.providerLink;

  const sections: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { icon: Home, label: 'Inicio', href: '/', show: !isProvider },
        {
          icon: ClipboardList,
          label: 'Órdenes',
          href: '/orders',
          show: has(PERMISSIONS.ORDERS.LIST),
        },
        {
          icon: Wallet,
          label: 'Cuentas por pagar',
          href: '/accounts-payable',
          show: has(PERMISSIONS.ACCOUNTS_PAYABLE.LIST),
        },
        {
          icon: HandCoins,
          label: 'Cuentas por cobrar',
          href: '/accounts-receivable',
          show: has(PERMISSIONS.ACCOUNTS_RECEIVABLE.LIST),
        },
        {
          icon: Receipt,
          label: 'Retenciones por pagar',
          href: '/taxes-payable',
          show: has(PERMISSIONS.TAXES_PAYABLE.LIST),
        },
        {
          icon: UserRound,
          label: 'Pacientes',
          href: '/patients',
          show: has(PERMISSIONS.PATIENTS.LIST),
        },
        {
          icon: BriefcaseMedical,
          label: 'Doctores',
          href: '/doctors',
          show: has(PERMISSIONS.DOCTORS.LIST),
        },
        {
          icon: Hospital,
          label: 'Centros de atención',
          href: '/care-centers',
          show: has(PERMISSIONS.CARE_CENTERS.LIST),
        },
        {
          icon: Briefcase,
          label: 'Contratistas',
          href: '/contractors',
          show: has(PERMISSIONS.CONTRACTORS.LIST),
        },
      ],
    },
    /*{
      title: 'Guías',
      items: [
        { icon: BookOpen, label: 'Guía del sistema', href: '/guide', show: true },
      ],
    },*/
    {
      title: 'Catálogos',
      items: [
        {
          icon: Stethoscope,
          label: 'Especialidades',
          href: '/specialties',
          show: has(PERMISSIONS.SPECIALTIES.LIST),
        },
        {
          icon: ShieldIcon,
          label: 'Seguros',
          href: '/insurances',
          show: has(PERMISSIONS.INSURANCES.LIST),
        },
        {
          icon: Activity,
          label: 'Patologías',
          href: '/pathologies',
          show: has(PERMISSIONS.PATHOLOGIES.LIST),
        },
        {
          icon: FileText,
          label: 'Tipos de servicio',
          href: '/service-types',
          show: has(PERMISSIONS.SERVICE_TYPES.LIST),
        },
      ],
    },
    {
      title: 'Reportes',
      items: [
        {
          icon: LayoutDashboard,
          label: 'Panel ejecutivo',
          href: '/reports/executive-panel',
          show: has(PERMISSIONS.REPORTS.EXECUTIVE_PANEL_LIST),
        },
        {
          icon: LineChart,
          label: 'Análisis de órdenes',
          href: '/reports/orders-analytics',
          show: has(PERMISSIONS.REPORTS.ORDERS_ANALYTICS_LIST),
        },
        {
          icon: PiggyBank,
          label: 'Cobranzas por aseguradora',
          href: '/reports/insurer-collections',
          show: has(PERMISSIONS.REPORTS.INSURER_COLLECTIONS_LIST),
        },
        {
          icon: Coins,
          label: 'Cuentas por cobrar',
          href: '/reports/receivables',
          show: has(PERMISSIONS.REPORTS.RECEIVABLES_LIST),
        },
        {
          icon: Banknote,
          label: 'Cuentas por pagar',
          href: '/reports/payables',
          show: has(PERMISSIONS.REPORTS.PAYABLES_LIST),
        },
        {
          icon: Receipt,
          label: 'Impuestos retenidos',
          href: '/reports/taxes-retained',
          show: has(PERMISSIONS.REPORTS.TAXES_RETAINED_LIST),
        },
        {
          icon: BarChart3,
          label: 'Resumen financiero',
          href: '/reports/financial-summary',
          show: has(PERMISSIONS.REPORTS.FINANCIAL_SUMMARY_LIST),
        },
        {
          icon: UserCog,
          label: 'Producción por médico',
          href: '/reports/doctor-production',
          show: has(PERMISSIONS.REPORTS.DOCTOR_PRODUCTION_LIST),
        },
        {
          icon: ShieldCheck,
          label: 'Producción por aseguradora',
          href: '/reports/insurance-production',
          show: has(PERMISSIONS.REPORTS.INSURANCE_PRODUCTION_LIST),
        },
        {
          icon: Clock4,
          label: 'Antigüedad de saldos',
          href: '/reports/aging',
          show: has(PERMISSIONS.REPORTS.AGING_LIST),
        },
        {
          icon: ArrowDownCircle,
          label: 'Cobros recibidos',
          href: '/reports/collections',
          show: has(PERMISSIONS.REPORTS.COLLECTIONS_LIST),
        },
        {
          icon: Wallet,
          label: 'Dinero por cuenta',
          href: '/reports/payment-account-inflows',
          show: has(PERMISSIONS.REPORTS.PAYMENT_ACCOUNT_INFLOWS_LIST),
        },
        {
          icon: ArrowUpCircle,
          label: 'Pagos emitidos',
          href: '/reports/disbursements',
          show: has(PERMISSIONS.REPORTS.DISBURSEMENTS_LIST),
        },
        {
          icon: Workflow,
          label: 'Seguimiento de órdenes',
          href: '/reports/orders-pipeline',
          show: has(PERMISSIONS.REPORTS.ORDERS_TRACKING_LIST),
        },
        {
          icon: PieChart,
          label: 'Servicios facturados',
          href: '/reports/services-billed',
          show: has(PERMISSIONS.REPORTS.SERVICES_BILLED_LIST),
        },
      ],
    },
    {
      title: 'Administración',
      items: [
        {
          icon: Users,
          label: 'Usuarios',
          href: '/users',
          show: has(PERMISSIONS.USERS.LIST),
        },
        {
          icon: Shield,
          label: 'Roles y permisos',
          href: '/roles',
          show: has(PERMISSIONS.ROLES.LIST),
        },
        {
          icon: Building,
          label: 'Sucursales',
          href: '/branches',
          show: has(PERMISSIONS.BRANCHES.LIST),
        },
        {
          icon: Wallet,
          label: 'Cuentas de pago',
          href: '/payment-accounts',
          show: has(PERMISSIONS.PAYMENT_ACCOUNTS.LIST),
        },
        {
          icon: TrendingUp,
          label: 'Tasas de cambio',
          href: '/exchange-rates',
          show: has(PERMISSIONS.EXCHANGE_RATES.LIST),
        },
        {
          icon: Calculator,
          label: 'Unidades tributarias',
          href: '/tax-units',
          show: has(PERMISSIONS.TAX_UNITS.LIST),
        },
        {
          icon: Settings,
          label: 'Configuración',
          href: '/config',
          show: has(PERMISSIONS.APP_CONFIG.VIEW),
        },
      ],
    },
  ];

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';
  const primaryRole = user?.roles?.[0]?.name ?? (user?.isSuperAdmin ? 'Super Admin' : '');

  const isItemActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  const visibleSections = sections.filter((s) => s.items.some((i) => i.show));

  const findSectionWithActiveItem = () =>
    visibleSections.find((s) => s.items.some((i) => i.show && isItemActive(i.href)))?.title ?? null;

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (visibleSections.length > 0) initial.add(visibleSections[0].title);
    const active = findSectionWithActiveItem();
    if (active) initial.add(active);
    return initial;
  });

  useEffect(() => {
    const active = findSectionWithActiveItem();
    if (!active) return;
    setOpenSections((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center overflow-hidden shadow-sm">
          <img
            src="/logo-afmi-cuadrado.png"
            alt="AFMI"
            className="w-full h-full object-contain p-0.5"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold text-sidebar-foreground">AFMI</span>
          <span className="text-[11px] text-muted-foreground">Sistema de gestión médica</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {visibleSections.map((section) => {
          const visible = section.items.filter((i) => i.show);
          const isOpen = openSections.has(section.title);
          const sectionId = `sidebar-section-${section.title.replace(/\s+/g, '-').toLowerCase()}`;
          return (
            <div key={section.title} className="mb-1">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                aria-expanded={isOpen}
                aria-controls={sectionId}
                className={cn(
                  'group w-full flex items-center justify-between gap-2 px-3 py-2 mt-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                  isOpen
                    ? 'text-sidebar-foreground bg-sidebar-accent/40'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/40',
                )}
              >
                <span>{section.title}</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 shrink-0 transition-transform duration-200 text-brand-cyan',
                    isOpen ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </button>
              {isOpen && (
                <ul id={sectionId} className="space-y-0.5 mt-1">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(item.href);
                    return (
                      <li key={item.href} className="relative">
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-cyan"
                          />
                        )}
                        <Link
                          to={item.href}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                            active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                              : 'text-sidebar-foreground/85 font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )}
                        >
                          <Icon className="w-[18px] h-[18px] shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {typeof item.badge === 'number' && item.badge > 0 && (
                            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-cyan text-white">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-[13px] font-semibold text-sidebar-foreground truncate">
            {user ? getFullName(user) : ''}
          </div>
          {primaryRole && (
            <div className="text-[11px] text-muted-foreground truncate">{primaryRole}</div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Cerrar sesión"
          className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Desktop sticky sidebar. Hidden below md. */
export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 h-screen sticky top-0 self-start bg-sidebar border-r border-sidebar-border flex-col shrink-0 z-30">
      <SidebarContent />
    </aside>
  );
}
