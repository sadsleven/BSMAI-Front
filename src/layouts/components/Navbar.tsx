import { Bell, LogOut, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    notify.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="text-sm text-muted-foreground">{user ? getFullName(user) : ''}</div>
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-accent rounded-full" type="button">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={user?.email ?? ''}
              className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {user ? (
              <DropdownMenuLabel className="px-2 py-2">
                <div className="text-sm font-medium text-foreground truncate">
                  {getFullName(user)}
                </div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </DropdownMenuLabel>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              <UserIcon className="w-4 h-4" />
              <span>Mi perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
