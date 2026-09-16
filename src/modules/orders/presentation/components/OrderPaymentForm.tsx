import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRatesByCurrency } from '@/modules/exchange-rates/presentation/hooks/useUsdRates';
import type { OrderPaymentValues } from '@/lib/validations/schemas';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '../../domain/models/order';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { localTodayIso } from '@/lib/dates';
import { PaymentAccountSelect } from '@/modules/payment-accounts/presentation/components/PaymentAccountSelect';
import {
  paymentAccountSummary,
  type PaymentAccount,
} from '@/modules/payment-accounts/domain/models/paymentAccount';

const ALL_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_usd',
  'cash_eur',
  'cash_bs',
  'other',
];

/**
 * Tipos para pagos ENTRANTES (órdenes contado + cuentas por cobrar). Agrega
 * `card` (Punto / POS de tarjeta), que sólo aplica a ingresos contra una cuenta
 * propia. Los flujos de egreso (AP / impuestos) usan `ALL_TYPES` / subconjuntos
 * propios y NO ofrecen `card`.
 */
export const INCOMING_PAYMENT_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'bank_transfer_usd',
  'card',
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
  paymentAccountId?: string;
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

/**
 * Cuenta de pago registrada del BENEFICIARIO (doctor/centro), para flujos de
 * egreso (cuentas por pagar). Misma forma que `DoctorPaymentMethod` /
 * `CareCenterPaymentMethod`. Al elegirla se precarga banco/cuenta del pago.
 */
export type RecipientPaymentMethod = {
  id?: string;
  type: 'mobile_payment' | 'bank_transfer' | 'other';
  bankCode?: string | null;
  phoneNumber?: string | null;
  idDocument?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  description?: string | null;
};

/** Sentinel del selector de cuenta del proveedor → ingreso manual (no se persiste). */
const RECIPIENT_MANUAL = '__manual__';

/** Etiqueta legible de una cuenta registrada del proveedor. */
function recipientMethodLabel(m: RecipientPaymentMethod, banks: Bank[]): string {
  const bankName = m.bankCode
    ? banks.find((b) => b.code === m.bankCode)?.name ?? m.bankCode
    : null;
  if (m.type === 'mobile_payment') {
    return ['Pago móvil', bankName, m.phoneNumber].filter(Boolean).join(' · ');
  }
  if (m.type === 'bank_transfer') {
    const acct = m.accountNumber ? `…${String(m.accountNumber).slice(-4)}` : null;
    return ['Transferencia', bankName, acct].filter(Boolean).join(' · ');
  }
  return m.description?.trim() || 'Otra cuenta';
}

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
  /**
   * Cuando `true` (default), las filas mobile_payment/bank_transfer/other
   * usan `<PaymentAccountSelect />` y exigen `paymentAccountId`. Pasar
   * `false` para flujos de egreso (AP / impuestos) que usan el catálogo
   * de bancos del beneficiario en lugar de cuentas propias.
   */
  usePaymentAccount?: boolean;
  /**
   * Cuentas registradas del beneficiario (doctor/centro). Cuando se provee y
   * `usePaymentAccount` es false, las filas mobile_payment/bank_transfer/other
   * ofrecen un selector "Cuenta del proveedor" que precarga banco/cuenta. Si el
   * proveedor no tiene cuenta del tipo de la fila, se cae al ingreso manual.
   */
  recipientMethods?: RecipientPaymentMethod[];
  /**
   * Restringe los tipos de pago seleccionables por fila y en los botones
   * internos. Default: todos. Retenciones (Bs fijos) pasan solo tipos en BS.
   */
  allowedTypes?: OrderPaymentType[];
  /**
   * Oculta el campo de solo lectura "Tasa de cambio". Útil cuando el pago es
   * en Bs fijos sin conversión (retenciones al SENIAT).
   */
  hideExchangeRate?: boolean;
  /**
   * Convierte "Tasa de cambio" en un selector por fila: cada pago guarda la
   * tasa a la que efectivamente se pagó (Bs → tasa USD/Bs; EUR → tasa EUR/Bs).
   * Con `false` (default) el campo queda de solo lectura con la tasa vigente.
   */
  rateSelectable?: boolean;
  /**
   * Con `rateSelectable`, bloquea el selector de tasa USD/Bs de las filas en
   * Bs: la fila sigue guardando `exchangeRateId` (y las tasas se siguen
   * cargando para mostrarla y convertir montos), pero el usuario no la cambia
   * desde la fila; la decide el padre vía `usdRate` (p. ej. la tasa de pago
   * del lote en cuentas por pagar). Las filas en EUR no tienen tasa del padre
   * y conservan su selector EUR/Bs.
   */
  rateLocked?: boolean;
  /** Texto de ayuda bajo el campo de tasa bloqueado (dónde se cambia). */
  rateLockedNote?: string;
  /**
   * Notifica las tasas cargadas por el selector para que el padre pueda
   * convertir montos de pagos que referencian tasas no vigentes.
   */
  onRatesLoaded?: (rates: ExchangeRate[]) => void;
  /**
   * Lo que falta para cuadrar, en su moneda natural: `USD` en órdenes (Paso 1),
   * `BS` en lotes de cuentas por pagar. Positivo = falta, negativo = excede.
   * Con esto, cada fila en Bs (pago móvil, transferencia, punto, efectivo Bs)
   * muestra bajo el Monto el valor EXACTO en Bs que cuadra la fila, calculado
   * con la tasa de esa misma fila — así el usuario no convierte a mano y no
   * quedan diferencias de redondeo. Al hacer clic se copia al campo.
   */
  remaining?: { amount: number; currency: 'USD' | 'BS' } | null;
};

/** `effectiveDate` es `timestamptz`: se muestra en hora de Venezuela. */
function rateDateLabel(effectiveDate: string): string {
  const d = new Date(effectiveDate);
  if (Number.isNaN(d.getTime())) return effectiveDate.slice(0, 10);
  return d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Etiqueta de una tasa: `1 USD = 500,00 Bs. · 17/08/2026 · vigente`. */
function rateOptionLabel(r: ExchangeRate, currentRateId?: string | null): string {
  const parts = [`1 ${r.currency} = ${formatMoney(r.amountBs)} Bs.`];
  if (r.effectiveDate) parts.push(rateDateLabel(r.effectiveDate));
  if (currentRateId && r.id === currentRateId) parts.push('vigente');
  return parts.join(' · ');
}

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
    paymentAccountId: '',
    accountNumber: '',
    amountValue: 0,
  };
  if (
    type === 'mobile_payment' ||
    type === 'bank_transfer' ||
    type === 'card' ||
    type === 'cash_bs'
  ) {
    return { ...base, exchangeRateId: usdRateId ?? '', amountCurrency: 'BS' };
  }
  if (type === 'cash_usd' || type === 'bank_transfer_usd') {
    // bank_transfer_usd: cuenta propia en USD, sin tasa (como cash_usd).
    return { ...base, amountCurrency: 'USD' };
  }
  if (type === 'cash_eur') {
    return { ...base, exchangeRateId: eurRateId ?? '', amountCurrency: 'EUR' };
  }
  // other → USD por defecto, pero editable.
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
  usePaymentAccount = true,
  recipientMethods,
  allowedTypes = ALL_TYPES,
  hideExchangeRate = false,
  rateSelectable = false,
  rateLocked = false,
  rateLockedNote,
  onRatesLoaded,
  remaining = null,
}: OrderPaymentFormProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [eurRate, setEurRate] = useState<ExchangeRate | null>(null);
  const [paymentAccountsById, setPaymentAccountsById] = useState<
    Record<string, PaymentAccount>
  >({});

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
          p.type === 'bank_transfer' ||
          p.type === 'card');
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

  // ---- Selector de tasa por fila -------------------------------------------
  // Cada pago guarda la tasa a la que se pagó: Bs → USD/Bs, EUR → EUR/Bs.
  const ratesEnabled = rateSelectable && !hideExchangeRate;
  const { rates: usdRates, currentRateId: currentUsdRateId } =
    useRatesByCurrency('USD', ratesEnabled);
  const { rates: eurRates, currentRateId: currentEurRateId } =
    useRatesByCurrency('EUR', ratesEnabled);

  // Tasas referenciadas por pagos ya guardados que no están en las listas
  // (viejas o deshabilitadas): se cargan por id para no perder la selección.
  const [extraRatesById, setExtraRatesById] = useState<Record<string, ExchangeRate>>({});
  const attemptedRateIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ratesEnabled) return;
    const known = new Set([
      ...usdRates.map((r) => r.id),
      ...eurRates.map((r) => r.id),
      ...Object.keys(extraRatesById),
    ]);
    const missing = Array.from(
      new Set(
        payments
          .map((p) => (p.exchangeRateId ?? '').trim())
          .filter(
            (id) => id && !known.has(id) && !attemptedRateIds.current.has(id),
          ),
      ),
    );
    if (missing.length === 0) return;
    missing.forEach((id) => attemptedRateIds.current.add(id));
    let cancelled = false;
    Promise.all(
      missing.map((id) => exchangeRateGateway.getById(id).catch(() => null)),
    ).then((loaded) => {
      if (cancelled) return;
      const found = loaded.filter((r): r is ExchangeRate => !!r);
      if (!found.length) return;
      setExtraRatesById((prev) => {
        const next = { ...prev };
        for (const r of found) next[r.id] = r;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratesEnabled, payments, usdRates, eurRates]);

  const ratesByCurrency = useMemo(() => {
    const extras = Object.values(extraRatesById);
    const merge = (base: ExchangeRate[], currency: 'USD' | 'EUR') => {
      const ids = new Set(base.map((r) => r.id));
      return [
        ...base,
        ...extras.filter((r) => r.currency === currency && !ids.has(r.id)),
      ];
    };
    return { USD: merge(usdRates, 'USD'), EUR: merge(eurRates, 'EUR') };
  }, [usdRates, eurRates, extraRatesById]);

  // El padre necesita las tasas cargadas para convertir montos de pagos que
  // referencian una tasa que no es la vigente.
  useEffect(() => {
    if (!onRatesLoaded) return;
    const all = [...ratesByCurrency.USD, ...ratesByCurrency.EUR];
    if (all.length) onRatesLoaded(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratesByCurrency]);

  const todayIso = localTodayIso();

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
            const isCard = p.type === 'card';
            // Punto se comporta como pago móvil/transferencia: cuenta propia,
            // referencia, Bs con tasa USD/Bs.
            const isCardLike = isMobileOrTransfer || isCard;
            // Transferencia en dólares: cuenta propia + referencia (como cardLike),
            // pero monto en USD y sin tasa (como cash_usd).
            const isTransferUsd = p.type === 'bank_transfer_usd';
            // Tipos que eligen una cuenta de pago propia y snapshotean banco/cuenta.
            const usesOwnAccount = isCardLike || isTransferUsd;
            const isBs = p.type === 'cash_bs';
            const isUsd = p.type === 'cash_usd';
            const isEur = p.type === 'cash_eur';
            const isOther = p.type === 'other';
            const lock = lockedFields?.[i] ?? null;
            const info = methodInfo?.[i] ?? null;
            const typeLocked = !!lock?.type;
            const bankLocked = !!lock?.bankCode;
            const accountLocked = !!lock?.accountNumber;
            const selectedRowRate = (p.exchangeRateId ?? '').trim()
              ? ratesByCurrency.USD.find((r) => r.id === p.exchangeRateId) ??
                ratesByCurrency.EUR.find((r) => r.id === p.exchangeRateId) ??
                null
              : null;
            const rowRate = selectedRowRate ?? (isEur ? eurRate : usdRate);
            // Monto en Bs que dejaría la operación cuadrada para esta fila:
            // lo ya tipeado + lo que falta (convertido con la tasa de la fila si
            // el faltante viene en USD). Sólo filas en Bs.
            const rowIsBs = isBs || isCardLike;
            const balancedBs = (() => {
              if (!remaining || !rowIsBs) return null;
              const pending = Number(remaining.amount);
              if (!Number.isFinite(pending) || Math.abs(pending) < 0.005) return null;
              let pendingBs = pending;
              if (remaining.currency === 'USD') {
                const bs = Number(rowRate?.amountBs ?? 0);
                if (!bs || bs <= 0) return null;
                pendingBs = pending * bs;
              }
              const target =
                Math.round((Number(p.amountValue || 0) + pendingBs) * 100) / 100;
              if (target <= 0) return null;
              return Math.abs(target - Number(p.amountValue || 0)) < 0.01
                ? null
                : target;
            })();
            const rowRateOptions = isEur ? ratesByCurrency.EUR : ratesByCurrency.USD;
            const rowCurrentRateId = isEur ? currentEurRateId : currentUsdRateId;
            // Cuentas registradas del beneficiario que aplican a esta fila.
            const recipientPickable =
              !!recipientMethods && !usePaymentAccount && (isMobileOrTransfer || isOther);
            const rowMethods = recipientPickable
              ? recipientMethods!.filter((m) => m.type === p.type && m.id)
              : [];
            const chosenRecipient =
              recipientPickable && p.paymentAccountId
                ? rowMethods.find((m) => m.id === p.paymentAccountId) ?? null
                : null;
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
                        {allowedTypes.map((t) => (
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
                  {!isUsd && !isOther && !isTransferUsd && !hideExchangeRate ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Tasa de cambio</Label>
                      {rateSelectable && rateLocked && !isEur ? (
                        <>
                          <Input
                            readOnly
                            value={
                              rowRate ? rateOptionLabel(rowRate, rowCurrentRateId) : '—'
                            }
                            className={cn(
                              'h-9 bg-muted/30',
                              err.exchangeRateId && 'border-destructive',
                            )}
                          />
                          {rateLockedNote ? (
                            <p className="text-[11px] text-muted-foreground">
                              {rateLockedNote}
                            </p>
                          ) : null}
                        </>
                      ) : rateSelectable ? (
                        <Select
                          value={p.exchangeRateId || ''}
                          onValueChange={(v) => update(i, { exchangeRateId: v })}
                          disabled={disabled || rowRateOptions.length === 0}
                        >
                          <SelectTrigger
                            className={cn(
                              'h-9',
                              err.exchangeRateId && 'border-destructive',
                            )}
                          >
                            <SelectValue
                              placeholder={
                                rowRateOptions.length === 0
                                  ? 'Sin tasas disponibles'
                                  : 'Selecciona la tasa'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {rowRateOptions.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {rateOptionLabel(r, rowCurrentRateId)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          readOnly
                          value={
                            rowRate
                              ? `1 ${rowRate.currency} = ${formatMoney(rowRate.amountBs)} Bs.`
                              : '—'
                          }
                          className="h-9 bg-muted/30"
                        />
                      )}
                      {err.exchangeRateId ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {err.exchangeRateId}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {usesOwnAccount && usePaymentAccount ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta bancaria propia</Label>
                      <PaymentAccountSelect
                        value={p.paymentAccountId ?? ''}
                        onChange={(id, account) => {
                          if (account) {
                            setPaymentAccountsById((prev) =>
                              prev[account.id] ? prev : { ...prev, [account.id]: account },
                            );
                          }
                          update(i, {
                            paymentAccountId: id,
                            bankCode: account?.bankCode ?? '',
                            accountNumber: account?.accountNumber ?? '',
                          });
                        }}
                        type={
                          p.type as
                            | 'mobile_payment'
                            | 'bank_transfer'
                            | 'bank_transfer_usd'
                            | 'card'
                        }
                        currentAccount={
                          p.paymentAccountId
                            ? paymentAccountsById[p.paymentAccountId] ?? null
                            : null
                        }
                        disabled={disabled}
                        error={!!err.paymentAccountId}
                      />
                      {err.paymentAccountId ? (
                        <p className="text-xs text-destructive">{err.paymentAccountId}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {recipientPickable && rowMethods.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta del proveedor</Label>
                      <Select
                        value={p.paymentAccountId || RECIPIENT_MANUAL}
                        onValueChange={(v) => {
                          if (v === RECIPIENT_MANUAL) {
                            update(i, {
                              paymentAccountId: '',
                              bankCode: '',
                              accountNumber: '',
                            });
                            return;
                          }
                          const m = rowMethods.find((x) => x.id === v);
                          update(i, {
                            paymentAccountId: v,
                            bankCode: m?.bankCode ?? '',
                            accountNumber: m?.accountNumber ?? '',
                          });
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecciona una cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {rowMethods.map((m) => (
                            <SelectItem key={m.id} value={m.id as string}>
                              {recipientMethodLabel(m, banks)}
                            </SelectItem>
                          ))}
                          <SelectItem value={RECIPIENT_MANUAL}>
                            Otra cuenta (ingresar manual)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {isMobileOrTransfer && !usePaymentAccount && !chosenRecipient ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Banco</Label>
                      <Select
                        value={p.bankCode || ''}
                        onValueChange={(v) => update(i, { bankCode: v })}
                        disabled={disabled || bankLocked}
                      >
                        <SelectTrigger className={cn('h-9', err.bankCode && 'border-destructive')}>
                          <SelectValue placeholder="Selecciona banco" />
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

                  {isOther && usePaymentAccount ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta bancaria propia</Label>
                      <PaymentAccountSelect
                        value={p.paymentAccountId ?? ''}
                        onChange={(id, account) => {
                          if (account) {
                            setPaymentAccountsById((prev) =>
                              prev[account.id] ? prev : { ...prev, [account.id]: account },
                            );
                          }
                          update(i, { paymentAccountId: id });
                        }}
                        type="other"
                        currentAccount={
                          p.paymentAccountId
                            ? paymentAccountsById[p.paymentAccountId] ?? null
                            : null
                        }
                        disabled={disabled}
                        error={!!err.paymentAccountId}
                      />
                      {err.paymentAccountId ? (
                        <p className="text-xs text-destructive">{err.paymentAccountId}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {(isCardLike || isTransferUsd || isOther) ? (
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

                  {isOther && !usePaymentAccount && !chosenRecipient ? (
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
                        isBs || isCardLike
                          ? 'Bs.'
                          : isUsd || isOther || isTransferUsd
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
                    {balancedBs != null ? (
                      disabled ? (
                        <p className="text-xs text-muted-foreground">
                          Para cuadrar:{' '}
                          <span className="font-mono">Bs {formatMoney(balancedBs)}</span>
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => update(i, { amountValue: balancedBs })}
                          className="text-xs text-brand-blue hover:underline text-left"
                          title="Usar este monto para cuadrar"
                        >
                          Para cuadrar:{' '}
                          <span className="font-mono">Bs {formatMoney(balancedBs)}</span>
                        </button>
                      )
                    ) : null}
                  </div>
                </div>

                {(() => {
                  // Si usePaymentAccount y hay cuenta seleccionada, sintetizar info.
                  let derivedInfo = info;
                  if (
                    !derivedInfo &&
                    usePaymentAccount &&
                    p.paymentAccountId &&
                    paymentAccountsById[p.paymentAccountId]
                  ) {
                    const a = paymentAccountsById[p.paymentAccountId];
                    const bankName =
                      a.bankCode ? banks.find((b) => b.code === a.bankCode)?.name : null;
                    derivedInfo = {
                      label: a.name,
                      bankName: bankName ?? a.bankCode ?? null,
                      phoneNumber: a.phoneNumber,
                      accountHolderName: a.accountHolderName,
                      idDocument: a.idDocument,
                      description:
                        a.type === 'other'
                          ? a.description
                          : paymentAccountSummary(a) || null,
                    };
                  }
                  // Egreso: cuenta registrada del proveedor seleccionada.
                  if (
                    !derivedInfo &&
                    !usePaymentAccount &&
                    recipientMethods &&
                    p.paymentAccountId
                  ) {
                    const m = recipientMethods.find((x) => x.id === p.paymentAccountId);
                    if (m) {
                      const bankName = m.bankCode
                        ? banks.find((b) => b.code === m.bankCode)?.name ?? m.bankCode
                        : null;
                      derivedInfo = {
                        label: 'Cuenta registrada del proveedor',
                        bankName: bankName ?? null,
                        phoneNumber: m.phoneNumber,
                        accountHolderName: m.accountHolderName,
                        idDocument: m.idDocument,
                        description: m.type === 'other' ? m.description : null,
                      };
                    }
                  }
                  if (!derivedInfo) return null;
                  return (
                    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs space-y-1">
                      {derivedInfo.label ? (
                        <div className="font-semibold text-foreground">
                          {derivedInfo.label}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                        {derivedInfo.bankName ? (
                          <span>
                            <span className="font-medium text-foreground">Banco:</span>{' '}
                            {derivedInfo.bankName}
                          </span>
                        ) : null}
                        {derivedInfo.accountHolderName ? (
                          <span>
                            <span className="font-medium text-foreground">Titular:</span>{' '}
                            {derivedInfo.accountHolderName}
                          </span>
                        ) : null}
                        {derivedInfo.idDocument ? (
                          <span>
                            <span className="font-medium text-foreground">CI/RIF:</span>{' '}
                            {derivedInfo.idDocument}
                          </span>
                        ) : null}
                        {derivedInfo.phoneNumber ? (
                          <span>
                            <span className="font-medium text-foreground">Teléfono:</span>{' '}
                            {derivedInfo.phoneNumber}
                          </span>
                        ) : null}
                        {p.accountNumber && !isOther ? (
                          <span>
                            <span className="font-medium text-foreground">Cuenta:</span>{' '}
                            {p.accountNumber}
                          </span>
                        ) : null}
                        {derivedInfo.description ? (
                          <span>
                            <span className="font-medium text-foreground">Nota:</span>{' '}
                            {derivedInfo.description}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {hideAddButtons ? null : (
        <div className="flex flex-wrap gap-2">
          {allowedTypes.map((t) => (
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
 * Tasa USD/Bs con la que se convierte un pago en Bs: la elegida en el propio
 * pago (snapshot de la tasa a la que se pagó) y, si no tiene, la de referencia
 * del contexto (tasa vigente / de facturación / del lote).
 */
function usdBsForPayment(
  p: OrderPaymentValues,
  usdRate: ExchangeRate | null | undefined,
  rateLookup: (id: string) => ExchangeRate | null,
): number {
  const rateId = (p.exchangeRateId || '').trim();
  const own = rateId ? rateLookup(rateId) : null;
  if (own && own.currency === 'USD') {
    const bs = Number(own.amountBs);
    if (Number.isFinite(bs) && bs > 0) return bs;
  }
  const fallback = Number(usdRate?.amountBs ?? 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/**
 * Convierte un pago a USD.
 * - USD → directo.
 * - BS  → amount / tasa USD/Bs del pago (o la de referencia si no tiene).
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

  if (p.amountCurrency === 'BS') {
    const usdBs = usdBsForPayment(p, usdRate, rateLookup);
    if (!usdBs) return 0;
    return amount / usdBs;
  }

  const usdBs = Number(usdRate?.amountBs ?? 0);
  if (!usdBs || usdBs <= 0) return 0;

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
    const usdBs = usdBsForPayment(p, usdRate, rateLookup);
    if (!usdBs) return 0;
    return amount * usdBs;
  }

  // EUR
  const rateId = (p.exchangeRateId || '').trim();
  const eurRate = rateId ? rateLookup(rateId) : null;
  const eurBs = Number(eurRate?.amountBs ?? 0);
  if (!eurBs || eurBs <= 0) return 0;
  return amount * eurBs;
}
