import axios, { type AxiosError } from 'axios';
import { getApiBaseUrl } from './config';
import { getAccessToken, clearAccessToken } from '@/modules/auth/infrastructure/tokenStorage';

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
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isLoginAttempt =
        requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');
      if (!isLoginAttempt) {
        clearAccessToken();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);
