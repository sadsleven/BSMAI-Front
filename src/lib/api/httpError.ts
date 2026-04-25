import axios from 'axios';

export function getHttpErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string; detail?: string }
      | undefined;
    if (data && typeof data === 'object') {
      const msg = data.message ?? data.error ?? data.detail;
      if (typeof msg === 'string' && msg.length) return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
