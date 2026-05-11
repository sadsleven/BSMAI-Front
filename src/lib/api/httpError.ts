import axios from 'axios';

export function getHttpErrorMessage(error: unknown, fallback?: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string; detail?: string }
      | undefined;
    if (data && typeof data === 'object') {
      const msg = data.message ?? data.error ?? data.detail;
      if (typeof msg === 'string' && msg.length) return msg;
    }
    if (error.message) return error.message;
    return fallback ?? 'Error desconocido';
  }
  if (error instanceof Error) return error.message || (fallback ?? 'Error desconocido');
  return fallback ?? 'Error desconocido';
}
