import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { clearAccessToken, getAccessToken } from '@/modules/auth/infrastructure/tokenStorage';
import { getJwtExpiryMs, isJwtExpired } from '@/modules/auth/infrastructure/jwt';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const EXPIRY_SKEW_MS = 5_000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, isLoading, setUser, setLoading } = useAuthStore();
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [probeNonce, setProbeNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        setNetworkError(false);
        setLoading(false);
        return;
      }
      if (isJwtExpired(token, EXPIRY_SKEW_MS)) {
        clearAccessToken();
        setUser(null);
        setNetworkError(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const me = await authApi.getMe();
        if (cancelled) return;
        setUser(me);
        setNetworkError(false);
      } catch (err) {
        if (cancelled) return;
        // No HTTP response = backend unreachable. Keep token, show retry screen.
        // Avoids redirect loop with LoginPage (which bounces back to "/" when token exists).
        const isNetworkError = axios.isAxiosError(err) && !err.response;
        if (isNetworkError) {
          setNetworkError(true);
        } else {
          // 401/403/etc — token invalid. Interceptor handles 401; clear user so the
          // redirect effect routes to /login.
          setUser(null);
          setNetworkError(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser, setLoading, probeNonce]);

  const retryProbe = useCallback(() => {
    setNetworkError(false);
    setProbeNonce((n) => n + 1);
  }, []);

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
    // Skip redirect on network error — LoginPage would bounce us back here
    // (token still present) and create an infinite loop.
    if (!isLoading && !user && !networkError) {
      navigate('/login', { replace: true });
    }
  }, [user, isLoading, networkError, navigate]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }
  if (networkError && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full bg-card rounded-xl border shadow-xs p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive-soft flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[18px] font-semibold">No se pudo conectar con el servidor</h1>
            <p className="text-sm text-muted-foreground">
              Verifica tu conexión y reintenta. Tu sesión sigue activa.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button onClick={retryProbe}>Reintentar</Button>
            <Button
              variant="outline"
              onClick={() => {
                clearAccessToken();
                setUser(null);
                setNetworkError(false);
                navigate('/login', { replace: true });
              }}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
