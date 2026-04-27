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

  const sections: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { icon: Home, label: 'Inicio', href: '/', show: true },
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
      ],
    },
    {
      title: 'Catálogos',
      items: [
        {
          icon: Stethoscope,
          label: 'Especialidades',
          href: '/specialties',
          show: has(PERMISSIONS.SPECIALTIES.LIST),
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
      ],
    },
  ];

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';
  const primaryRole = user?.roles?.[0]?.name ?? (user?.isSuperAdmin ? 'Super Admin' : '');

  const isItemActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white font-bold shadow-sm">
          A
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold text-sidebar-foreground">AFMI</span>
          <span className="text-[11px] text-muted-foreground">Sistema clínico</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {sections.map((section) => {
          const visible = section.items.filter((i) => i.show);
          if (visible.length === 0) return null;
          return (
            <div key={section.title} className="mb-2">
              <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section.title}
              </div>
              <ul className="space-y-0.5">
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
