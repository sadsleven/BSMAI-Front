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
    if (!error.response && error.code !== 'ERR_CANCELED') {
      notify.error('No se pudo conectar con el servidor. Verificá tu conexión.');
    }

    return Promise.reject(error);
  },
);
