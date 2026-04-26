import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { clearAccessToken, getAccessToken } from '@/modules/auth/infrastructure/tokenStorage';
import { getJwtExpiryMs, isJwtExpired } from '@/modules/auth/infrastructure/jwt';

const EXPIRY_SKEW_MS = 5_000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, isLoading, setUser, setLoading } = useAuthStore();
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (isJwtExpired(token, EXPIRY_SKEW_MS)) {
        clearAccessToken();
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser, setLoading]);

  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;
    const expMs = getJwtExpiryMs(token);
    if (!expMs) return;
    const delay = Math.max(expMs - Date.now() - EXPIRY_SKEW_MS, 0);
    expiryTimerRef.current = setTimeout(() => {
      clearAccessToken();
      setUser(null);
      navigate('/login', { replace: true });
    }, delay);
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [user, navigate, setUser]);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }
  if (!user) return null;
  return <>{children}</>;
}
