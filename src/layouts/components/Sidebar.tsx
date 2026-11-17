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
  ClipboardCheck,
  Wallet,
  HandCoins,
  Receipt,
  ChevronDown,
  Library,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
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
  Settings,
  FileSpreadsheet,
  Landmark,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getFullName } from '@/modules/auth/domain/models/authUser';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  show: boolean;
  badge?: number;
};

type NavSection = {
  title: string;
  /** Shown in the mini (collapsed) sidebar. */
  icon: LucideIcon;
  items: NavItem[];
};

export type SidebarContentProps = {
  /** Called after a nav link is clicked (used to close mobile drawer). */
  onNavigate?: () => void;
};

/** Nav model + shared state behind both the full and the mini sidebar. */
function useSidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { has, hasAny } = usePermissions();

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
      icon: Home,
      items: [
        { icon: Home, label: 'Inicio', href: '/', show: !isProvider },
        {
          icon: ClipboardCheck,
          label: 'Presupuestos',
          href: '/budgets',
          show: has(PERMISSIONS.BUDGETS.LIST),
        },
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
      icon: Library,
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
      icon: BarChart3,
      items: [
        {
          icon: LayoutDashboard,
          label: 'Panel ejecutivo',
          href: '/reports/executive-panel',
          show: has(PERMISSIONS.REPORTS.EXECUTIVE_PANEL_LIST),
        },
        {
          icon: Receipt,
          label: 'Facturas',
          href: '/reports/invoices',
          show: has(PERMISSIONS.REPORTS.INVOICES_LIST),
        },
        {
          icon: TrendingUp,
          label: 'Relación de ingresos',
          href: '/reports/income-relation',
          show: has(PERMISSIONS.REPORTS.INCOME_RELATION_LIST),
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
          icon: FileSpreadsheet,
          label: 'Comprobantes ARC',
          href: '/reports/arc',
          show: has(PERMISSIONS.REPORTS.ARC_LIST),
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
      icon: Cog,
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
          label: 'Cuentas bancarias',
          href: '/payment-accounts',
          show: has(PERMISSIONS.PAYMENT_ACCOUNTS.LIST),
        },
        {
          icon: Landmark,
          label: 'Bancos',
          href: '/banks',
          show: hasAny([
            PERMISSIONS.BANKS.CREATE,
            PERMISSIONS.BANKS.UPDATE,
            PERMISSIONS.BANKS.TOGGLE_ACTIVE,
          ]),
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

  return {
    user,
    initials,
    primaryRole,
    visibleSections,
    isItemActive,
    openSections,
    toggleSection,
    handleLogout,
  };
}

/** Inner UI of the sidebar — reusable in desktop aside and mobile drawer. */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const {
    user,
    initials,
    primaryRole,
    visibleSections,
    isItemActive,
    openSections,
    toggleSection,
    handleLogout,
  } = useSidebarNav();

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

/**
 * Icon-only sidebar body (mini). Each section is a button that opens a flyout
 * with its links, so the whole nav stays reachable at 64px wide.
 */
function SidebarMiniContent() {
  const { user, initials, primaryRole, visibleSections, isItemActive, handleLogout } =
    useSidebarNav();
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-2 py-[18px] border-b border-sidebar-border flex justify-center">
        <div
          title="AFMI — Sistema de gestión médica"
          className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center overflow-hidden shadow-sm"
        >
          <img
            src="/logo-afmi-cuadrado.png"
            alt="AFMI"
            className="w-full h-full object-contain p-0.5"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto flex flex-col items-center gap-1">
        {visibleSections.map((section) => {
          const SectionIcon = section.icon;
          const items = section.items.filter((i) => i.show);
          const sectionActive = items.some((i) => isItemActive(i.href));
          return (
            <Popover
              key={section.title}
              open={openFlyout === section.title}
              onOpenChange={(open) => setOpenFlyout(open ? section.title : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={section.title}
                  aria-label={section.title}
                  className={cn(
                    'relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                    sectionActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  {sectionActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-cyan"
                    />
                  )}
                  <SectionIcon className="w-[18px] h-[18px]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={10}
                className="w-64 p-1.5 max-h-[70vh] overflow-y-auto"
              >
                <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {section.title}
                </div>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href}
                          onClick={() => setOpenFlyout(null)}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                            active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                              : 'text-foreground/85 font-medium hover:bg-muted',
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
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
              </PopoverContent>
            </Popover>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border flex flex-col items-center gap-2">
        <div
          title={user ? `${getFullName(user)}${primaryRole ? ` · ${primaryRole}` : ''}` : ''}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-xs font-bold"
        >
          {initials}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const COLLAPSED_KEY = 'afmi:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Desktop sticky sidebar. Collapsible to a 64px mini rail. Hidden below md. */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage no disponible: el estado vive sólo en memoria */
    }
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'hidden md:flex h-screen sticky top-0 self-start bg-sidebar border-r border-sidebar-border flex-col shrink-0 z-30 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-pressed={collapsed}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        title={collapsed ? 'Expandir menú' : 'Contraer menú'}
        className="absolute -right-3 top-6 z-40 w-6 h-6 rounded-full border border-sidebar-border bg-sidebar text-muted-foreground shadow-sm flex items-center justify-center hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        {collapsed ? (
          <PanelLeftOpen className="w-3.5 h-3.5" />
        ) : (
          <PanelLeftClose className="w-3.5 h-3.5" />
        )}
      </button>
      {collapsed ? <SidebarMiniContent /> : <SidebarContent />}
    </aside>
  );
}
