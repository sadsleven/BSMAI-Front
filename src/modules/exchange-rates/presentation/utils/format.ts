import { formatMoney } from '@/lib/format/money';

/** Formatea un monto en bolívares con notación venezolana (485,22 → "485,22"). */
export function formatBs(amount: string | number): string {
  return formatMoney(amount);
}
