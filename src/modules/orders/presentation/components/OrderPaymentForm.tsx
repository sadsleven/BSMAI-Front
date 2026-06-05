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
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { OrderPaymentValues } from '@/lib/validations/schemas';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '../../domain/models/order';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';

const ALL_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_usd',
  'cash_eur',
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

/** Bloqueos por fila — campos pre-cargados desde método registrado. */
export type PaymentLockedFields = {
  type?: boolean;
  bankCode?: boolean;
  accountNumber?: boolean;
};

/** Info contextual del método registrado (no editable, sólo display). */
export type PaymentMethodInfo = {
  label?: string;
  bankName?: string | null;
  phoneNumber?: string | null;
  accountHolderName?: string | null;
  idDocument?: string | null;
  description?: string | null;
};

export type OrderPaymentFormProps = {
  payments: OrderPaymentValues[];
  onChange: (next: OrderPaymentValues[]) => void;
  /** Tasa USD/Bs vigente (ref para convertir pagos BS y EUR a USD). */
  usdRate: ExchangeRate | null;
  /** Notifica al padre cuando se carga una tasa EUR (para cache de lookup). */
  onEurRateLoaded?: (rate: ExchangeRate) => void;
  errors?: PaymentItemErrors[];
  disabled?: boolean;
  /** Oculta los botones internos "Agregar pago" (el padre los renderiza). */
  hideAddButtons?: boolean;
  /** Campos bloqueados por fila (prefill desde método registrado). */
  lockedFields?: (PaymentLockedFields | null)[];
  /** Info del método registrado por fila (display). */
  methodInfo?: (PaymentMethodInfo | null)[];
  /** Override del handler de quitar fila (sincroniza arrays paralelos). */
  onRemovePayment?: (idx: number) => void;
};

function defaultsForType(
  type: OrderPaymentType,
  todayIso: string,
  usdRateId?: string,
  eurRateId?: string,
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
    return { ...base, exchangeRateId: usdRateId ?? '', amountCurrency: 'BS' };
  }
  if (type === 'cash_usd') {
    return { ...base, amountCurrency: 'USD' };
  }
  if (type === 'cash_eur') {
    return { ...base, exchangeRateId: eurRateId ?? '', amountCurrency: 'EUR' };
  }
  // other → USD.
  return { ...base, amountCurrency: 'USD' };
}

export function OrderPaymentForm({
  payments,
  onChange,
  usdRate,
  onEurRateLoaded,
  errors,
  disabled,
  hideAddButtons,
  lockedFields,
  methodInfo,
  onRemovePayment,
}: OrderPaymentFormProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [eurRate, setEurRate] = useState<ExchangeRate | null>(null);

  useEffect(() => {
    bankGateway
      .list()
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  // Carga tasa EUR vigente para snapshot de pagos cash_eur.
  useEffect(() => {
    let cancelled = false;
    exchangeRateGateway
      .getCurrent('EUR')
      .then((r) => {
        if (cancelled) return;
        setEurRate(r);
        onEurRateLoaded?.(r);
      })
      .catch(() => !cancelled && setEurRate(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backfill exchangeRateId al cargar tasas. BS/mobile/bank → USD rate; EUR → EUR rate.
  useEffect(() => {
    if (!usdRate?.id && !eurRate?.id) return;
    let dirty = false;
    const next = payments.map((p) => {
      const hasRate = !!(p.exchangeRateId && p.exchangeRateId.trim());
      if (hasRate) return p;
      const needsUsd =
        p.amountCurrency === 'BS' &&
        (p.type === 'cash_bs' ||
          p.type === 'mobile_payment' ||
          p.type === 'bank_transfer');
      const needsEur = p.amountCurrency === 'EUR' && p.type === 'cash_eur';
      if (needsUsd && usdRate?.id) {
        dirty = true;
        return { ...p, exchangeRateId: usdRate.id };
      }
      if (needsEur && eurRate?.id) {
        dirty = true;
        return { ...p, exchangeRateId: eurRate.id };
      }
      return p;
    });
    if (dirty) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdRate?.id, eurRate?.id]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const update = (idx: number, patch: Partial<OrderPaymentValues>) => {
    const next = payments.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (idx: number) => {
    if (onRemovePayment) {
      onRemovePayment(idx);
      return;
    }
    onChange(payments.filter((_, i) => i !== idx));
  };

  const add = (type: OrderPaymentType) => {
    onChange([
      ...payments,
      defaultsForType(type, todayIso, usdRate?.id, eurRate?.id),
    ]);
  };

  const changeType = (idx: number, type: OrderPaymentType) => {
    update(
      idx,
      defaultsForType(
        type,
        payments[idx]?.paymentDate || todayIso,
        usdRate?.id,
        eurRate?.id,
      ),
    );
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
            const isUsd = p.type === 'cash_usd';
            const isEur = p.type === 'cash_eur';
            const isOther = p.type === 'other';
            const lock = lockedFields?.[i] ?? null;
            const info = methodInfo?.[i] ?? null;
            const typeLocked = !!lock?.type;
            const bankLocked = !!lock?.bankCode;
            const accountLocked = !!lock?.accountNumber;
            const rowRate = isEur ? eurRate : usdRate;
            return (
              <div key={i} className="rounded-lg border p-3 space-y-3 bg-card">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={p.type}
                      onValueChange={(v) => changeType(i, v as OrderPaymentType)}
                      disabled={disabled || typeLocked}
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
                  {!isUsd && !isOther ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Tasa de cambio</Label>
                      <Input
                        readOnly
                        value={
                          rowRate
                            ? `1 ${rowRate.currency} = ${formatMoney(rowRate.amountBs)} Bs.`
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
                        disabled={disabled || bankLocked}
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
                        disabled={disabled || accountLocked}
                        readOnly={accountLocked}
                        className={cn('h-9', accountLocked && 'bg-muted/30')}
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
                          : isUsd || isOther
                            ? 'USD'
                            : isEur
                              ? 'EUR'
                              : p.amountCurrency
                      }
                      className={cn(err.amountValue && 'border-destructive')}
                    />
                    {err.amountValue ? (
                      <p className="text-xs text-destructive">{err.amountValue}</p>
                    ) : null}
                  </div>
                </div>

                {info ? (
                  <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs space-y-1">
                    {info.label ? (
                      <div className="font-semibold text-foreground">
                        {info.label}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                      {info.bankName ? (
                        <span>
                          <span className="font-medium text-foreground">Banco:</span>{' '}
                          {info.bankName}
                        </span>
                      ) : null}
                      {info.accountHolderName ? (
                        <span>
                          <span className="font-medium text-foreground">Titular:</span>{' '}
                          {info.accountHolderName}
                        </span>
                      ) : null}
                      {info.idDocument ? (
                        <span>
                          <span className="font-medium text-foreground">CI/RIF:</span>{' '}
                          {info.idDocument}
                        </span>
                      ) : null}
                      {info.phoneNumber ? (
                        <span>
                          <span className="font-medium text-foreground">Teléfono:</span>{' '}
                          {info.phoneNumber}
                        </span>
                      ) : null}
                      {p.accountNumber && !isOther ? (
                        <span>
                          <span className="font-medium text-foreground">Cuenta:</span>{' '}
                          {p.accountNumber}
                        </span>
                      ) : null}
                      {info.description ? (
                        <span>
                          <span className="font-medium text-foreground">Nota:</span>{' '}
                          {info.description}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {hideAddButtons ? null : (
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
      )}
    </div>
  );
}

/**
 * Convierte un pago a USD.
 * - USD → directo.
 * - BS  → amount / usdRate.amountBs.
 * - EUR → (amount × eurRate.amountBs) / usdRate.amountBs; eurRate viene del
 *         snapshot del propio pago (exchangeRateId → rateLookup).
 *
 * Devuelve 0 si falta tasa requerida (UI debe alertar).
 */
export function paymentInUsd(
  p: OrderPaymentValues,
  usdRate: ExchangeRate | null | undefined,
  rateLookup: (id: string) => ExchangeRate | null,
): number {
  const amount = Number(p.amountValue || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (p.amountCurrency === 'USD') return amount;

  const usdBs = Number(usdRate?.amountBs ?? 0);
  if (!usdBs || usdBs <= 0) return 0;

  if (p.amountCurrency === 'BS') return amount / usdBs;

  // EUR
  const rateId = (p.exchangeRateId || '').trim();
  const eurRate = rateId ? rateLookup(rateId) : null;
  const eurBs = Number(eurRate?.amountBs ?? 0);
  if (!eurBs || eurBs <= 0) return 0;
  return (amount * eurBs) / usdBs;
}

/**
 * Convierte un pago a Bolívares.
 *  - BS  → directo.
 *  - USD → amount × usdRate.amountBs.
 *  - EUR → amount × eurRate.amountBs (snapshot del pago).
 *
 * Devuelve 0 si falta tasa requerida.
 */
export function paymentInBs(
  p: OrderPaymentValues,
  usdRate: ExchangeRate | null | undefined,
  rateLookup: (id: string) => ExchangeRate | null,
): number {
  const amount = Number(p.amountValue || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (p.amountCurrency === 'BS') return amount;

  if (p.amountCurrency === 'USD') {
    const usdBs = Number(usdRate?.amountBs ?? 0);
    if (!usdBs || usdBs <= 0) return 0;
    return amount * usdBs;
  }

  // EUR
  const rateId = (p.exchangeRateId || '').trim();
  const eurRate = rateId ? rateLookup(rateId) : null;
  const eurBs = Number(eurRate?.amountBs ?? 0);
  if (!eurBs || eurBs <= 0) return 0;
  return amount * eurBs;
}
