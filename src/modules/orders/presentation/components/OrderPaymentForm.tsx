import { useEffect, useState } from 'react';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DatePicker } from '@/components/ui/date-picker';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Bank } from '@/modules/banks/domain/models/bank';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import type { OrderPaymentValues } from '@/lib/validations/schemas';
import {
  PAYMENT_TYPE_LABEL,
  type OrderCurrency,
  type OrderPaymentType,
  type PaymentCurrency,
} from '../../domain/models/order';
import { cn } from '@/lib/utils';

const ALL_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_foreign',
  'cash_bs',
  'other',
];

export type PaymentItemErrors = {
  type?: string;
  paymentDate?: string;
  referenceNumber?: string;
  bankCode?: string;
  exchangeRateId?: string;
  amountCurrency?: string;
  amountValue?: string;
};

export type OrderPaymentFormProps = {
  payments: OrderPaymentValues[];
  onChange: (next: OrderPaymentValues[]) => void;
  /** Moneda de la orden — define amountCurrency para `cash_foreign` y `other`. */
  orderCurrency: OrderCurrency;
  /** Tasa actual de la moneda de la orden (provista por el padre). */
  currentRate: ExchangeRate | null;
  errors?: PaymentItemErrors[];
  disabled?: boolean;
};

function defaultsForType(
  type: OrderPaymentType,
  orderCurrency: OrderCurrency,
  todayIso: string,
  currentRateId?: string,
): OrderPaymentValues {
  const base = {
    type,
    paymentDate: todayIso,
    referenceNumber: '',
    bankCode: '',
    exchangeRateId: '',
    accountNumber: '',
    amountValue: 0,
  };
  if (type === 'mobile_payment' || type === 'bank_transfer' || type === 'cash_bs') {
    return { ...base, amountCurrency: 'BS', exchangeRateId: currentRateId ?? '' };
  }
  // cash_foreign, other
  return { ...base, amountCurrency: orderCurrency as PaymentCurrency };
}

export function OrderPaymentForm({
  payments,
  onChange,
  orderCurrency,
  currentRate,
  errors,
  disabled,
}: OrderPaymentFormProps) {
  const [banks, setBanks] = useState<Bank[]>([]);

  useEffect(() => {
    bankGateway
      .list()
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  // Backfill exchangeRateId on BS-typed payments once currentRate is known.
  useEffect(() => {
    if (!currentRate?.id) return;
    let dirty = false;
    const next = payments.map((p) => {
      const needsRate =
        (p.type === 'mobile_payment' || p.type === 'bank_transfer' || p.type === 'cash_bs') &&
        !(p.exchangeRateId && p.exchangeRateId.trim());
      if (needsRate) {
        dirty = true;
        return { ...p, exchangeRateId: currentRate.id };
      }
      return p;
    });
    if (dirty) onChange(next);
    // Intentionally only react to currentRate change; payments handled implicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRate?.id]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const update = (idx: number, patch: Partial<OrderPaymentValues>) => {
    const next = payments.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (idx: number) => onChange(payments.filter((_, i) => i !== idx));

  const add = (type: OrderPaymentType) => {
    onChange([
      ...payments,
      defaultsForType(type, orderCurrency, todayIso, currentRate?.id),
    ]);
  };

  const changeType = (idx: number, type: OrderPaymentType) => {
    update(idx, defaultsForType(type, orderCurrency, payments[idx]?.paymentDate || todayIso, currentRate?.id));
  };

  return (
    <div className="space-y-3">
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pagos registrados.</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p, i) => {
            const err = errors?.[i] ?? {};
            const isMobileOrTransfer = p.type === 'mobile_payment' || p.type === 'bank_transfer';
            const isBs = p.type === 'cash_bs';
            const isForeign = p.type === 'cash_foreign';
            const isOther = p.type === 'other';
            return (
              <div key={i} className="rounded-lg border p-3 space-y-3 bg-card">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={p.type}
                      onValueChange={(v) => changeType(i, v as OrderPaymentType)}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PAYMENT_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha</Label>
                    <DatePicker
                      value={p.paymentDate || undefined}
                      onChange={(v) => update(i, { paymentDate: v ?? '' })}
                      disabled={disabled}
                      invalid={!!err.paymentDate}
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive-soft"
                      onClick={() => remove(i)}
                      disabled={disabled}
                      title="Quitar pago"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(isMobileOrTransfer || isBs) ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Tasa de cambio</Label>
                      <Input
                        readOnly
                        value={
                          currentRate
                            ? `1 ${currentRate.currency} = ${Number(currentRate.amountBs).toFixed(2)} Bs.`
                            : '—'
                        }
                        className="h-9 bg-muted/30"
                      />
                      {err.exchangeRateId ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {err.exchangeRateId}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {isMobileOrTransfer ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Banco</Label>
                      <Select
                        value={p.bankCode || ''}
                        onValueChange={(v) => update(i, { bankCode: v })}
                        disabled={disabled}
                      >
                        <SelectTrigger className={cn('h-9', err.bankCode && 'border-destructive')}>
                          <SelectValue placeholder="Seleccioná banco" />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.code} value={b.code}>
                              {b.code} · {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {err.bankCode ? (
                        <p className="text-xs text-destructive">{err.bankCode}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {(isMobileOrTransfer || isOther) ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Referencia</Label>
                      <Input
                        value={p.referenceNumber ?? ''}
                        onChange={(e) => update(i, { referenceNumber: e.target.value })}
                        maxLength={20}
                        disabled={disabled}
                        className={cn('h-9', err.referenceNumber && 'border-destructive')}
                      />
                      {err.referenceNumber ? (
                        <p className="text-xs text-destructive">{err.referenceNumber}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {isOther ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta (opcional)</Label>
                      <Input
                        value={p.accountNumber ?? ''}
                        onChange={(e) => update(i, { accountNumber: e.target.value })}
                        maxLength={40}
                        disabled={disabled}
                        className="h-9"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label className="text-xs">Monto</Label>
                    <CurrencyAmountInput
                      value={typeof p.amountValue === 'number' ? p.amountValue : undefined}
                      onChange={(v) => update(i, { amountValue: v ?? 0 })}
                      disabled={disabled}
                      currencyPrefix={
                        isBs || isMobileOrTransfer
                          ? 'Bs.'
                          : isForeign || isOther
                            ? orderCurrency
                            : p.amountCurrency
                      }
                      className={cn(err.amountValue && 'border-destructive')}
                    />
                    {err.amountValue ? (
                      <p className="text-xs text-destructive">{err.amountValue}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map((t) => (
          <Button
            key={t}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add(t)}
            disabled={disabled}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> {PAYMENT_TYPE_LABEL[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Convierte un pago a la moneda de la orden usando la tasa histórica del pago.
 * - Si amountCurrency = orderCurrency → directo.
 * - Si amountCurrency = BS y orderCurrency = USD/EUR → BS / rate.amountBs.
 * - Si amountCurrency = USD/EUR distinto a orderCurrency → no soportado (devolvemos 0).
 */
export function paymentInOrderCurrency(
  p: OrderPaymentValues,
  orderCurrency: OrderCurrency,
  rateLookup: (id: string) => ExchangeRate | null,
): number {
  const amount = Number(p.amountValue || 0);
  if (p.amountCurrency === orderCurrency) return amount;
  if (p.amountCurrency === 'BS') {
    const rateId = (p.exchangeRateId || '').trim();
    if (!rateId) return 0;
    const rate = rateLookup(rateId);
    if (!rate) return 0;
    const r = Number(rate.amountBs);
    if (!r) return 0;
    return amount / r;
  }
  return 0;
}
