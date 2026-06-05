import { formatMoney } from '@/lib/format/money';

/** Formatea un monto en bolívares con notación venezolana (43,00 → "43,00"). */
export function formatBs(amount: string | number): string {
  return formatMoney(amount);
}
