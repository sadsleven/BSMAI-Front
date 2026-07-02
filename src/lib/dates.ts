import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/**
 * YYYY-MM-DD de HOY en hora LOCAL. No usar `toISOString().slice(0,10)` para
 * esto: devuelve la fecha UTC, que en Venezuela (UTC-4) ya es "mañana" desde
 * las 20:00 y choca con las validaciones "no puede ser posterior a hoy".
 */
export function localTodayIso(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** DD/MM/YYYY (sin hora). Returns '—' on invalid input. */
export function formatCreated(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('DD/MM/YYYY') : '—';
}

/** DD/MM/YYYY hh:mm am/pm. Returns '—' on invalid input. */
export function formatCreatedDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('DD/MM/YYYY hh:mm a') : '—';
}
