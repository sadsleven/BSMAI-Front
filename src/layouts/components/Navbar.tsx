import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Plus, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getFullName } from '@/modules/auth/domain/models/authUser';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { notify } from '@/lib/notifications/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExchangeRatesBadge } from './ExchangeRatesBadge';
import { NavbarSearch } from './NavbarSearch';

export type NavbarProps = {
  onMenuClick?: () => void;
};

export function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  // Proveedores (doctor/centro) sólo gestionan sus informes: sin búsqueda
  // global ni creación de órdenes.
  const isProvider = !!user?.providerLink;

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    notify.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };

  const handleCreateOrder = () => {
    navigate('/orders/create');
  };

  return (
    <header className="h-16 sticky top-0 z-20 border-b bg-card flex items-center px-3 sm:px-6 gap-2 sm:gap-3 shrink-0">
      {/* Hamburger (mobile only) */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="md:hidden w-10 h-10 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Brand (mobile only — sidebar hidden) */}
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-sm font-bold shrink-0">
          A
        </div>
        <span className="text-[15px] font-bold truncate">AFMI</span>
      </div>

      {/* Left cluster: search + create order (desktop) */}
      {!isProvider && (
        <>
          <NavbarSearch />
          <Button
            size="sm"
            className="hidden md:inline-flex h-10 px-4 shrink-0"
            onClick={handleCreateOrder}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Crear orden
          </Button>
        </>
      )}

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Compact "Crear orden" on mobile (icon only) */}
        {!isProvider && (
          <Button
            size="icon"
            className="md:hidden h-10 w-10 shrink-0"
            onClick={handleCreateOrder}
            title="Crear orden"
            aria-label="Crear orden"
          >
            <Plus className="w-5 h-5" />
          </Button>
        )}
        <ExchangeRatesBadge />
        <button
          type="button"
          className="relative w-10 h-10 rounded-full hover:bg-muted transition-colors flex items-center justify-center shrink-0"
          title="Notificaciones"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-cyan" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={user?.email ?? ''}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="min-w-[260px] p-0 rounded-xl shadow-lg overflow-hidden"
          >
            {user ? (
              <DropdownMenuLabel className="px-3 py-3 flex items-center gap-3 bg-brand-blue-soft/60 border-b">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {getFullName(user)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
              </DropdownMenuLabel>
            ) : null}
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => navigate('/profile')}
                className="px-2.5 py-2 rounded-md text-sm gap-2"
              >
                <UserIcon className="w-4 h-4" />
                <span>Mi perfil</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void handleLogout()}
                className="px-2.5 py-2 rounded-md text-sm gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
