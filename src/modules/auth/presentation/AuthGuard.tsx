import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { getAccessToken } from '@/modules/auth/infrastructure/tokenStorage';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, isLoading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    (async () => {
      if (!getAccessToken()) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.getMe();
        setUser(me);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [setUser, setLoading]);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
