/** VE locale formatters for reports. */
import { formatDateOnly } from '@/lib/dates';
import {
  formatBs as fmtBs,
  formatBsCompact as fmtBsCompact,
  formatMoney,
  formatPercent as fmtPercent,
  formatUsd as fmtUsd,
} from '@/lib/format/money';

export function formatBs(n: number | null | undefined, decimals = 2): string {
  return fmtBs(n, { decimals, prefix: true });
}

export function formatUsd(n: number | null | undefined, decimals = 2): string {
  return fmtUsd(n, { decimals });
}

/** Bs en notación compacta para ejes/etiquetas de gráficos (p.ej. "Bs. 1,2 M"). */
export function formatBsCompact(n: number | null | undefined): string {
  return fmtBsCompact(n);
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  return formatMoney(n, { decimals });
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  return fmtPercent(n, { decimals });
}

/**
 * Fecha-solo (`YYYY-MM-DD` de columnas `date`) → DD/MM/YYYY sin `new Date`:
 * parsearlo crea medianoche UTC y en VE (UTC-4) imprime el día anterior.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = formatDateOnly(iso);
  return s || '—';
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const a = new Date(from);
  if (!Number.isFinite(a.getTime())) return 0;
  const ms = to.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Inclusive `from`/`to` date string filter — both `YYYY-MM-DD` optional. */
export function inDateRange(
  iso: string | null | undefined,
  from?: string,
  to?: string,
): boolean {
  if (!iso) return !from && !to;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function monthBucket(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}
