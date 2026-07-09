import { Banknote } from 'lucide-react';
import { PAYMENT_TYPE_LABEL } from '@/modules/orders/domain/models/order';
import { formatMoney } from '@/lib/format/money';
import { formatDateOnly } from '@/lib/dates';

type PaymentLike = {
  id: string;
  type:
    | 'mobile_payment'
    | 'bank_transfer'
    | 'bank_transfer_usd'
    | 'card'
    | 'cash_usd'
    | 'cash_eur'
    | 'cash_bs'
    | 'other';
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  amountCurrency: 'USD' | 'EUR' | 'BS';
  amountValue: string | number;
  /** Monto convertido en USD. Presente en pagos AR/AP. */
  amountInUsd?: string | number;
  /** Monto convertido en Bs. Presente en pagos al SENIAT (taxes_payable). */
  amountInBs?: string | number;
  createdAt?: string;
};

export function PaymentHistoryList({
  payments,
  emptyLabel = 'Sin pagos registrados.',
}: {
  payments: PaymentLike[] | null | undefined;
  emptyLabel?: string;
}) {
  if (!payments || payments.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>;
  }
  const sorted = [...payments].sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );
  // Detecta moneda nativa del registro: si todos traen `amountInBs`, mostrar Bs;
  // sino USD (default AP/AR).
  const isBsNative = sorted.every((p) => p.amountInBs !== undefined);
  const totalNative = sorted.reduce(
    (s, p) =>
      s +
      Number((isBsNative ? p.amountInBs : p.amountInUsd) ?? 0),
    0,
  );
  const nativeLabel = isBsNative ? 'Bs.' : 'USD';
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {sorted.map((p) => {
          const date = p.paymentDate ? formatDateOnly(p.paymentDate) : '—';
          const amount = formatMoney(p.amountValue);
          const nativeAmount = formatMoney(
            (isBsNative ? p.amountInBs : p.amountInUsd) ?? 0,
          );
          const meta: string[] = [];
          if (p.bankCode) meta.push(`Banco ${p.bankCode}`);
          if (p.referenceNumber) meta.push(`Ref. ${p.referenceNumber}`);
          if (p.accountNumber) meta.push(`Cta. ${p.accountNumber}`);
          const showConversion = isBsNative
            ? p.amountCurrency !== 'BS'
            : p.amountCurrency !== 'USD';
          return (
            <li
              key={p.id}
              className="rounded-lg border bg-card p-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-md bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {PAYMENT_TYPE_LABEL[p.type]} · {date}
                </div>
                {meta.length > 0 ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {meta.join(' · ')}
                  </div>
                ) : null}
              </div>
              <div className="text-sm font-mono text-right shrink-0">
                <div>
                  {amount} {p.amountCurrency}
                </div>
                {showConversion ? (
                  <div className="text-xs text-muted-foreground">
                    {nativeAmount} {nativeLabel}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
        <span>Total acumulado</span>
        <span className="font-mono">
          {formatMoney(totalNative)} {nativeLabel}
        </span>
      </div>
    </div>
  );
}
