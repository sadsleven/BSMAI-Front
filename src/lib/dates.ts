import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

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
