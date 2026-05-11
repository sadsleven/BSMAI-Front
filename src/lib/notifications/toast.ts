import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { getHttpErrorMessage } from '@/lib/api/httpError';

type Options = ExternalToast;

const DEFAULTS: Record<'success' | 'error' | 'warning' | 'info', Options> = {
  success: { duration: 3500 },
  error: { duration: 5500 },
  warning: { duration: 4500 },
  info: { duration: 3500 },
};

export const notify = {
  success(message: string, options?: Options) {
    sonnerToast.success(message, { ...DEFAULTS.success, ...options });
  },
  error(message: string, options?: Options) {
    sonnerToast.error(message, { ...DEFAULTS.error, ...options });
  },
  warning(message: string, options?: Options) {
    sonnerToast.warning(message, { ...DEFAULTS.warning, ...options });
  },
  info(message: string, options?: Options) {
    sonnerToast(message, { ...DEFAULTS.info, ...options });
  },
  /** Show backend message when present, fallback otherwise. */
  fromError(err: unknown, fallback = 'Ocurrió un error inesperado.') {
    const msg = getHttpErrorMessage(err) || fallback;
    this.error(msg);
  },
};

export type Notify = typeof notify;
