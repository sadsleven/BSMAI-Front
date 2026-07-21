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

/**
 * Fecha-solo (`YYYY-MM-DD` o ISO más largo) → `DD/MM/YYYY` SIN pasar por
 * `new Date()`: JS parsea `YYYY-MM-DD` como medianoche UTC y en Venezuela
 * (UTC-4) `toLocaleDateString` imprime el día anterior. Usar para columnas
 * `date` del BE (`orderDate`, `paymentDate`, `birthDate`, …).
 */
export function formatDateOnly(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/**
 * ISO 8601 local CON offset explícito (`2026-07-16T14:30:00-04:00`). Para
 * columnas `timestamptz` (effectiveDate, appointmentDate): un ISO sin offset
 * lo interpreta Postgres con la TZ de sesión del servidor — correcto en local
 * (America/Caracas) pero corrido ±4h contra un servidor/BD en UTC.
 */
export function toIsoWithOffset(d: Date): string {
  return dayjs(d).format('YYYY-MM-DDTHH:mm:ssZ');
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
