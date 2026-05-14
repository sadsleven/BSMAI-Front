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
import { orderPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  type PaymentItemErrors,
  paymentInOrderCurrency,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { Badge } from '@/components/ui/badge';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import {
  collectedBs,
  collectedOriginal,
  pendingBs,
  pendingOriginal,
  type AccountsReceivable,
} from '../../domain/models/accountsReceivable';
import type { OrderCurrency } from '@/modules/orders/domain/models/order';

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
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
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

  const orderCurrency: OrderCurrency = useMemo(() => {
    return (accounts[0]?.order.priceCurrency as OrderCurrency) ?? 'USD';
  }, [accounts]);

  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent(orderCurrency);
        if (!cancelled) setCurrentRate(rate);
      } catch {
        if (!cancelled) setCurrentRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderCurrency, accounts.length]);

  // Grouping: mismo seguro
  const grouping = useMemo(() => {
    const insuranceIds = new Set(accounts.map((a) => a.insuranceId));
    if (insuranceIds.size > 1) return { ok: false, reason: 'Cuentas de seguros distintos' };
    return { ok: true, reason: '' };
  }, [accounts]);

  const sharedInsuranceId = useMemo(() => {
    const ids = new Set(accounts.map((a) => a.insuranceId));
    return ids.size === 1 ? [...ids][0] : null;
  }, [accounts]);

  useEffect(() => {
    if (!sharedInsuranceId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await accountsReceivableGateway.list({
          insuranceId: sharedInsuranceId,
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
  }, [sharedInsuranceId]);

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

  // Sum priceAmount in order currency (mostly homogenous; mark mixed)
  const totals = useMemo(() => {
    let totalOrders = 0;
    let totalCollectedBs = 0;
    let totalCollectedOriginal = 0;
    let totalPendingBs = 0;
    let totalPendingOriginal = 0;
    let unifiedCurrency: string | null = null;
    let mixedCurrency = false;
    for (const a of accounts) {
      totalOrders += Number(a.order.priceAmount);
      totalCollectedBs += collectedBs(a);
      const cOrig = collectedOriginal(a);
      if (cOrig !== null) totalCollectedOriginal += cOrig;
      const pBs = pendingBs(a);
      if (pBs !== null) totalPendingBs += pBs;
      const pOrig = pendingOriginal(a);
      if (pOrig !== null) totalPendingOriginal += pOrig;
      if (unifiedCurrency === null) unifiedCurrency = a.order.priceCurrency;
      else if (unifiedCurrency !== a.order.priceCurrency) mixedCurrency = true;
    }
    return {
      totalOrders,
      totalCollectedBs,
      totalCollectedOriginal,
      totalPendingBs,
      totalPendingOriginal,
      currency: unifiedCurrency,
      mixedCurrency,
    };
  }, [accounts]);

  const watchedPayments = methods.watch('payments') ?? [];
  const totalPaymentsInOrderCurrency = useMemo(() => {
    if (!currentRate) return 0;
    const lookup = (id: string): ExchangeRate | null =>
      id === currentRate.id ? currentRate : null;
    return watchedPayments.reduce(
      (sum, p) => sum + paymentInOrderCurrency(p, orderCurrency, lookup),
      0,
    );
  }, [watchedPayments, currentRate, orderCurrency]);

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
                seleccionada{accounts.length === 1 ? '' : 's'}.
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
              {grouping.reason}. Solo se pueden agrupar cuentas del mismo seguro.
            </div>
          )}

          <FormSection
            title="Cuentas seleccionadas"
            description="Resumen de las órdenes a cobrar al seguro."
          >
            <div className="flex justify-end mb-2">
              <Popover open={candidatesOpen} onOpenChange={setCandidatesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!sharedInsuranceId}
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
                        Sin cuentas disponibles para este seguro.
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
                              {Number(c.order.priceAmount).toFixed(2)}{' '}
                              {c.order.priceCurrency}
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
                      {a.insurance?.name ?? '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-mono">
                      {Number(a.order.priceAmount).toFixed(2)} {a.order.priceCurrency}
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
            <div className="border-t pt-3 mt-1 flex items-center justify-between text-sm font-semibold">
              <span>Total órdenes</span>
              <span className="font-mono">
                {totals.mixedCurrency
                  ? '—'
                  : `${totals.totalOrders.toFixed(2)} ${totals.currency ?? ''}`}
              </span>
            </div>
            <p className="text-xs italic text-muted-foreground mt-1">
              Sin cap de monto — el seguro suele pagar por encima del agregado.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a cobrar
                </div>
                <div className="text-lg font-semibold">
                  {totals.mixedCurrency
                    ? '—'
                    : `${totals.totalOrders.toFixed(2)} ${totals.currency ?? ''}`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Ya cobrado
                </div>
                <div className="text-lg font-semibold">
                  {totals.mixedCurrency
                    ? `${totals.totalCollectedBs.toFixed(2)} Bs.`
                    : `${totals.totalCollectedOriginal.toFixed(2)} ${totals.currency ?? ''}`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {Math.abs(totals.totalPendingBs) <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
                    </Badge>
                  ) : totals.totalPendingBs < 0 ? (
                    <Badge variant="default" className="bg-brand-blue text-white">
                      Excede{' '}
                      {totals.mixedCurrency
                        ? `${Math.abs(totals.totalPendingBs).toFixed(2)} Bs.`
                        : `${Math.abs(totals.totalPendingOriginal).toFixed(2)} ${totals.currency ?? ''}`}
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-warning text-white">
                      Faltan{' '}
                      {totals.mixedCurrency
                        ? `${totals.totalPendingBs.toFixed(2)} Bs.`
                        : `${totals.totalPendingOriginal.toFixed(2)} ${totals.currency ?? ''}`}
                    </Badge>
                  )}
                </div>
                {Math.abs(totals.totalPendingBs) >= 0.01 && (
                  <div className="text-xs text-muted-foreground">
                    {totals.totalPendingBs > 0 ? 'Faltan' : 'Excede'}{' '}
                    <span className="font-mono">
                      Bs.{' '}
                      {Math.abs(totals.totalPendingBs).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
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
                    orderCurrency={orderCurrency}
                    currentRate={currentRate}
                    errors={paymentsErrors}
                  />
                );
              }}
            />

            {currentRate ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Total cobros</div>
                  <div className="font-mono">
                    {totalPaymentsInOrderCurrency.toFixed(2)} {orderCurrency}
                  </div>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">
                    Tasa actual {currentRate.currency}
                  </div>
                  <div className="font-mono">
                    1 {currentRate.currency} = {Number(currentRate.amountBs).toFixed(2)} Bs.
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs italic text-muted-foreground">
                Sin tasa de cambio activa para {orderCurrency}: registrá una en
                /exchange-rates antes de continuar.
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
                  !currentRate ||
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
