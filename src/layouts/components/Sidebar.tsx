import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Users, Home, LogOut, Shield } from 'lucide-react';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const { has } = usePermissions();

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    notify.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };

  const items = [
    { icon: Home, label: 'Inicio', href: '/', show: true },
    { icon: Users, label: 'Usuarios', href: '/users', show: has(PERMISSIONS.USERS.LIST) },
    { icon: Shield, label: 'Roles', href: '/roles', show: has(PERMISSIONS.ROLES.LIST) },
  ];

  return (
    <aside className="w-64 bg-card border-r h-screen flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold text-primary">AFMI</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {items
          .filter((i) => i.show)
          .map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
      </nav>
      <div className="p-4 border-t">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
