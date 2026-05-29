import axios, { type AxiosError } from 'axios';
import { getApiBaseUrl } from './config';
import { getAccessToken, clearAccessToken } from '@/modules/auth/infrastructure/tokenStorage';
import { notify } from '@/lib/notifications/toast';

const baseURL = getApiBaseUrl() || undefined;

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url ?? '';
    const isLoginAttempt =
      requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    if (status === 401 && !isLoginAttempt) {
      clearAccessToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    // Surface unhandled network errors (no response from server) globally.
    // Skip the toast for /auth/me — AuthGuard renders a dedicated "server unreachable"
    // screen for that case, and showing it here causes a redirect loop with login.
    // Use a stable toast id so repeated failures replace the toast instead of stacking.
    const isAuthMeProbe = requestUrl.includes('/auth/me');
    if (!error.response && error.code !== 'ERR_CANCELED' && !isAuthMeProbe) {
      notify.error('No se pudo conectar con el servidor. Verificá tu conexión.', {
        id: 'network-error',
      });
    }

    return Promise.reject(error);
  },
);
