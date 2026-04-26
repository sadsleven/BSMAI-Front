import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { notify } from '@/lib/notifications/toast';

export function LogoutPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  useEffect(() => {
    (async () => {
      await authApi.logout();
      setUser(null);
      notify.success('Sesión cerrada');
      navigate('/login', { replace: true });
    })();
  }, [navigate, setUser]);
  return <div className="flex items-center justify-center min-h-screen">Cerrando sesión...</div>;
}
