/** VE locale formatters for reports. */

export function formatBs(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `Bs. ${Number(n).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatUsd(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Bs en notación compacta para ejes/etiquetas de gráficos (p.ej. "Bs. 1,2 M"). */
export function formatBsCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `Bs. ${Number(n).toLocaleString('es-VE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })}`;
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('es-VE');
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
