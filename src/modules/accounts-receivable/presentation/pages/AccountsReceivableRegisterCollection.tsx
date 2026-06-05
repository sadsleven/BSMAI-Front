import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronDown, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { FormSection } from '@/components/ui/form-section';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { orderPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  type PaymentItemErrors,
  paymentInBs,
  paymentInUsd,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { Badge } from '@/components/ui/badge';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import {
  collectedBs,
  collectedUsd,
  debtorDisplayName,
  debtorTypeOf,
  isCasheaAccount,
  isFixedRateAccount,
  pendingBs,
  pendingUsd,
  targetBs,
  targetUsd,
  type AccountsReceivable,
} from '../../domain/models/accountsReceivable';

const registerCollectionSchema = z.object({
  payments: z.array(orderPaymentSchema).min(1, 'Registrá al menos un cobro'),
});
type RegisterCollectionValues = z.infer<typeof registerCollectionSchema>;

type LocationState = { receivableIds?: string[] } | null;

export function AccountsReceivableRegisterCollection() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const initialIds = useMemo(
    () => state?.receivableIds ?? [],
    [state?.receivableIds],
  );
  const [receivableIds, setReceivableIds] = useState<string[]>(initialIds);

  const [accounts, setAccounts] = useState<AccountsReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState<ExchangeRate | null>(null);
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});
  const [candidates, setCandidates] = useState<AccountsReceivable[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidatesOpen, setCandidatesOpen] = useState(false);

  const methods = useForm<RegisterCollectionValues>({
    resolver: zodResolver(registerCollectionSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control } = methods;

  useEffect(() => {
    if (initialIds.length === 0) {
      notify.warning('No hay cuentas seleccionadas');
      navigate('/accounts-receivable', { replace: true });
    }
  }, [initialIds, navigate]);

  const load = useCallback(async () => {
    if (receivableIds.length === 0) return;
    setLoading(true);
    try {
      const items = await Promise.all(
        receivableIds.map((id) => accountsReceivableGateway.getById(id)),
      );
      setAccounts(items);
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudieron cargar las cuentas'));
      navigate('/accounts-receivable');
    } finally {
      setLoading(false);
    }
  }, [receivableIds, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent('USD');
        if (!cancelled) setUsdRate(rate);
      } catch {
        if (!cancelled) setUsdRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouping = useMemo(() => {
    const insuranceIds = new Set(
      accounts.filter((a) => a.insuranceId).map((a) => a.insuranceId!),
    );
    const holderIds = new Set(
      accounts.filter((a) => a.holderId).map((a) => a.holderId!),
    );
    if (insuranceIds.size > 0 && holderIds.size > 0)
      return { ok: false, reason: 'Cuentas de seguro y de titular mezcladas' };
    if (insuranceIds.size > 1)
      return { ok: false, reason: 'Cuentas de seguros distintos' };
    if (holderIds.size > 1)
      return { ok: false, reason: 'Cuentas de titulares distintos' };
    const fixed = accounts.filter(isFixedRateAccount).length;
    const usd = accounts.length - fixed;
    if (fixed > 0 && usd > 0)
      return {
        ok: false,
        reason: 'No se pueden mezclar cuentas con tasa fija (Bs) y cuentas en USD',
      };
    return { ok: true, reason: '' };
  }, [accounts]);

  const useFixedRateMode = useMemo(
    () => accounts.length > 0 && accounts.every(isFixedRateAccount),
    [accounts],
  );

  const debtorType = useMemo(
    () => (accounts[0] ? debtorTypeOf(accounts[0]) : 'insurance'),
    [accounts],
  );

  const sharedDebtorId = useMemo(() => {
    if (accounts.length === 0) return null;
    if (debtorType === 'insurance') {
      const ids = new Set(accounts.map((a) => a.insuranceId).filter(Boolean) as string[]);
      return ids.size === 1 ? [...ids][0] : null;
    }
    const ids = new Set(accounts.map((a) => a.holderId).filter(Boolean) as string[]);
    return ids.size === 1 ? [...ids][0] : null;
  }, [accounts, debtorType]);

  useEffect(() => {
    if (!sharedDebtorId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await accountsReceivableGateway.list({
          [debtorType === 'insurance' ? 'insuranceId' : 'holderId']: sharedDebtorId,
          limit: 100,
          sortBy: 'createdAt',
          sortDir: 'DESC',
        });
        if (cancelled) return;
        setCandidates(res.data);
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharedDebtorId, debtorType]);

  const eligibleCandidates = useMemo(() => {
    const selectedSet = new Set(receivableIds);
    const term = candidateSearch.trim().toLowerCase();
    return candidates
      .filter((c) => !selectedSet.has(c.id))
      .filter(
        (c) => c.status === 'uncollected' || c.status === 'partially_collected',
      )
      .filter((c) => {
        if (!term) return true;
        const num = String(c.order?.orderNumber ?? '').toLowerCase();
        const rNum = String(c.receivableNumber ?? '').toLowerCase();
        return num.includes(term) || rNum.includes(term);
      });
  }, [candidates, receivableIds, candidateSearch]);

  const toggleCandidate = (id: string) => {
    setReceivableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const removeSelected = (id: string) => {
    if (receivableIds.length <= 1) {
      notify.warning('Debe quedar al menos una cuenta seleccionada');
      return;
    }
    setReceivableIds((prev) => prev.filter((x) => x !== id));
  };

  const debtorName = accounts[0] ? debtorDisplayName(accounts[0]) : '';

  const totals = useMemo(() => {
    let totalOrders = 0;
    let totalCollected = 0;
    let totalPending = 0;
    for (const a of accounts) {
      if (useFixedRateMode) {
        totalOrders += targetBs(a) ?? 0;
        totalCollected += collectedBs(a);
        const pb = pendingBs(a);
        if (pb !== null) totalPending += pb;
      } else {
        totalOrders += targetUsd(a) ?? 0;
        totalCollected += collectedUsd(a);
        const pu = pendingUsd(a);
        if (pu !== null) totalPending += pu;
      }
    }
    return { totalOrders, totalCollected, totalPending };
  }, [accounts, useFixedRateMode]);

  const watchedPayments = methods.watch('payments') ?? [];
  const lookupRate = (id: string): ExchangeRate | null =>
    eurRatesById[id] ?? (usdRate && usdRate.id === id ? usdRate : null);
  const totalPaymentsUsd = useMemo(() => {
    return watchedPayments.reduce(
      (sum, p) => sum + paymentInUsd(p, usdRate, lookupRate),
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPayments, usdRate, eurRatesById]);
  const totalPaymentsBs = useMemo(() => {
    return watchedPayments.reduce(
      (sum, p) => sum + paymentInBs(p, usdRate, lookupRate),
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPayments, usdRate, eurRatesById]);

  const onSubmit = async (values: RegisterCollectionValues) => {
    if (!grouping.ok) {
      notify.error(grouping.reason);
      return;
    }
    try {
      await accountsReceivableGateway.registerCollection({
        receivableIds: accounts.map((a) => a.id),
        payments: values.payments.map((p) => ({
          type: p.type,
          paymentDate: p.paymentDate,
          referenceNumber: p.referenceNumber || undefined,
          bankCode: p.bankCode || undefined,
          accountNumber: p.accountNumber || undefined,
          exchangeRateId: p.exchangeRateId || undefined,
          amountCurrency: p.amountCurrency,
          amountValue: p.amountValue,
        })),
      });
      notify.success(`Cobro registrado en ${accounts.length} cuenta(s)`);
      navigate('/accounts-receivable');
    } catch (err) {
      notify.fromError(err, 'No se pudo registrar el cobro');
    }
  };

  if (loading || accounts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-sm text-muted-foreground">
        Cargando cuentas...
      </div>
    );
  }

  const debtorLabel = debtorType === 'holder' ? 'titular' : 'seguro';

  return (
    <div className="max-w-4xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))}
          className="space-y-6"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Registrar cobro
              </h1>
              <p className="text-sm text-muted-foreground">
                {accounts.length} cuenta{accounts.length === 1 ? '' : 's'} por cobrar
                seleccionada{accounts.length === 1 ? '' : 's'}
                {debtorName ? ` — ${debtorLabel} ${debtorName}` : ''}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/accounts-receivable')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver
            </button>
          </div>

          {!grouping.ok && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
              {grouping.reason}. Solo se pueden agrupar cuentas del mismo deudor.
            </div>
          )}

          <FormSection
            title="Cuentas seleccionadas"
            description={`Resumen USD de las órdenes a cobrar al ${debtorLabel}.`}
          >
            <div className="flex justify-end mb-2">
              <Popover open={candidatesOpen} onOpenChange={setCandidatesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!sharedDebtorId}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Agregar cuentas
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      ({eligibleCandidates.length})
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-96 p-0"
                  align="end"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por N° orden o cuenta…"
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        className="h-8 pl-7 text-sm"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {eligibleCandidates.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                        Sin cuentas disponibles para este {debtorLabel}.
                      </p>
                    ) : (
                      eligibleCandidates.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                        >
                          <Checkbox
                            checked={receivableIds.includes(c.id)}
                            onCheckedChange={() => toggleCandidate(c.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-semibold">
                                {c.receivableNumber}
                              </span>
                              <span className="text-muted-foreground">
                                · N° orden{' '}
                                <span className="font-mono">
                                  {c.order.orderNumber}
                                </span>
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {formatMoney(targetUsd(c) ?? 0)} USD
                              {isCasheaAccount(c) ? ' · Cashea' : ''}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <ul className="text-sm divide-y">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium font-mono">
                      N° {a.order.orderNumber}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {debtorDisplayName(a)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-mono text-right">
                      {isFixedRateAccount(a) ? (
                        <>
                          {formatMoney(targetBs(a) ?? 0)} Bs
                          <div className="text-[10px] text-muted-foreground font-sans">
                            tasa fija · {formatMoney(a.order.priceAmount)} USD ×{' '}
                            {formatMoney(a.order.fixedExchangeRate?.amountBs ?? 0)} Bs
                          </div>
                        </>
                      ) : (
                        <>
                          {formatMoney(targetUsd(a) ?? 0)} USD
                          {isCasheaAccount(a) ? (
                            <div className="text-[10px] text-muted-foreground font-sans">
                              neto Cashea · precio{' '}
                              {formatMoney(a.order.priceAmount)}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSelected(a.id)}
                      title="Quitar"
                      disabled={accounts.length <= 1}
                    >
                      ×
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {(() => {
              const unit = useFixedRateMode ? 'Bs' : 'USD';
              const fmt = (n: number) => formatMoney(n);
              return (
                <>
                  <div className="border-t pt-3 mt-1 flex items-center justify-between text-sm font-semibold">
                    <span>Total órdenes</span>
                    <span className="font-mono">
                      {fmt(totals.totalOrders)} {unit}
                    </span>
                  </div>
                  <p className="text-xs italic text-muted-foreground mt-1">
                    {useFixedRateMode
                      ? 'Modo tasa fija — los cobros se comparan en bolívares.'
                      : `Sin cap de monto — ${
                          debtorLabel === 'seguro'
                            ? 'el seguro suele pagar por encima del agregado'
                            : 'permite acumular cobros hasta saldar (o sobre-cobrar)'
                        }.`}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t">
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        Total a cobrar
                      </div>
                      <div className="text-lg font-semibold">
                        {fmt(totals.totalOrders)} {unit}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        Ya cobrado
                      </div>
                      <div className="text-lg font-semibold">
                        {fmt(totals.totalCollected)} {unit}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        Diferencia
                      </div>
                      <div className="text-lg font-semibold flex items-center gap-2">
                        {Math.abs(totals.totalPending) <= 0.01 ? (
                          <Badge variant="default" className="bg-success text-white">
                            Cuadrado
                          </Badge>
                        ) : totals.totalPending < 0 ? (
                          <Badge variant="default" className="bg-brand-blue text-white">
                            Excede {fmt(Math.abs(totals.totalPending))} {unit}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-warning text-white">
                            Faltan {fmt(totals.totalPending)} {unit}
                          </Badge>
                        )}
                      </div>
                      {Math.abs(totals.totalPending) > 0.01 && !useFixedRateMode && usdRate ? (
                        <div className="text-xs text-muted-foreground">
                          {totals.totalPending < 0 ? 'Excede' : 'Faltan'}{' '}
                          <span className="font-mono">
                            Bs{' '}
                            {formatMoney(
                              Math.abs(totals.totalPending) * Number(usdRate.amountBs),
                            )}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}
          </FormSection>

          <FormSection
            title="Cobros"
            description="Mismo componente de pagos usado al crear órdenes."
          >
            <Controller
              control={control}
              name="payments"
              render={({ field }) => {
                const rawPaymentsErrors = (formState.errors as { payments?: unknown })
                  .payments;
                const paymentsErrors: PaymentItemErrors[] | undefined = Array.isArray(
                  rawPaymentsErrors,
                )
                  ? (rawPaymentsErrors as Array<
                      Record<string, { message?: string } | undefined> | undefined
                    >).map((e) =>
                      e
                        ? {
                            type: e.type?.message,
                            paymentDate: e.paymentDate?.message,
                            referenceNumber: e.referenceNumber?.message,
                            bankCode: e.bankCode?.message,
                            exchangeRateId: e.exchangeRateId?.message,
                            amountCurrency: e.amountCurrency?.message,
                            amountValue: e.amountValue?.message,
                          }
                        : {},
                    )
                  : undefined;

                return (
                  <OrderPaymentForm
                    payments={(field.value ?? []) as OrderPaymentValues[]}
                    onChange={(next) => field.onChange(next)}
                    usdRate={usdRate}
                    onEurRateLoaded={(r) =>
                      setEurRatesById((prev) =>
                        prev[r.id] ? prev : { ...prev, [r.id]: r },
                      )
                    }
                    errors={paymentsErrors}
                  />
                );
              }}
            />

            {usdRate ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">
                    Total cobros ({useFixedRateMode ? 'Bs' : 'USD'})
                  </div>
                  <div className="font-mono">
                    {useFixedRateMode
                      ? `${formatMoney(totalPaymentsBs)} Bs`
                      : `${formatMoney(totalPaymentsUsd)} USD`}
                  </div>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Tasa USD actual</div>
                  <div className="font-mono">
                    1 USD = {formatMoney(usdRate.amountBs)} Bs.
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs italic text-muted-foreground">
                Sin tasa USD activa: registrá una en /exchange-rates antes de continuar.
              </p>
            )}
          </FormSection>

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/accounts-receivable')}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  formState.isSubmitting ||
                  !grouping.ok ||
                  !usdRate ||
                  watchedPayments.length === 0
                }
              >
                {formState.isSubmitting ? 'Guardando…' : 'Registrar cobro'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
