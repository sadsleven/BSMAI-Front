import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import {
  amountToReceive,
  recipientName,
  type AccountsPayable,
} from '../../domain/models/accountsPayable';
import type { OrderCurrency } from '@/modules/orders/domain/models/order';
import { useTaxRates } from '@/lib/config/taxRates';

const registerPaymentSchema = z.object({
  payments: z.array(orderPaymentSchema).min(1, 'Registrá al menos un pago'),
});
type RegisterPaymentValues = z.infer<typeof registerPaymentSchema>;

type LocationState = { payableIds?: string[] } | null;

export function AccountsPayableRegisterPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const payableIds = useMemo(() => state?.payableIds ?? [], [state?.payableIds]);

  const [accounts, setAccounts] = useState<AccountsPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const taxRates = useTaxRates();

  const methods = useForm<RegisterPaymentValues>({
    resolver: zodResolver(registerPaymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control } = methods;

  // Redirect back if no IDs in state.
  useEffect(() => {
    if (payableIds.length === 0) {
      notify.warning('No hay cuentas seleccionadas');
      navigate('/accounts-payable', { replace: true });
    }
  }, [payableIds, navigate]);

  // Load selected accounts.
  const load = useCallback(async () => {
    if (payableIds.length === 0) return;
    setLoading(true);
    try {
      const items = await Promise.all(
        payableIds.map((id) => accountsPayableGateway.getById(id)),
      );
      setAccounts(items);
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudieron cargar las cuentas'));
      navigate('/accounts-payable');
    } finally {
      setLoading(false);
    }
  }, [payableIds, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  // Resolve currency to use for OrderPaymentForm. Use first account's order's priceCurrency.
  const orderCurrency: OrderCurrency = useMemo(() => {
    return (accounts[0]?.order.priceCurrency as OrderCurrency) ?? 'USD';
  }, [accounts]);

  // Fetch current rate for that currency.
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

  // Validate grouping (same doctor or same care center).
  const grouping = useMemo(() => {
    const doctorIds = new Set(accounts.map((a) => a.doctorId).filter(Boolean));
    const careCenterIds = new Set(
      accounts.map((a) => a.careCenterId).filter(Boolean),
    );
    if (doctorIds.size > 1) return { ok: false, reason: 'Cuentas de doctores distintos' };
    if (careCenterIds.size > 1)
      return { ok: false, reason: 'Cuentas de centros distintos' };
    if (doctorIds.size > 0 && careCenterIds.size > 0)
      return { ok: false, reason: 'Mezcla de doctor y centro' };
    return { ok: true, reason: '' };
  }, [accounts]);

  // Sum amountToReceive (in moneda original del doctorAmount).
  const totals = useMemo(() => {
    let totalDoctorOriginal = 0;
    let totalToReceiveOriginal = 0;
    let unifiedCurrency: string | null = null;
    let mixedCurrency = false;
    for (const a of accounts) {
      if (!a.order.doctorAmount || !a.order.doctorAmountCurrency) continue;
      totalDoctorOriginal += Number(a.order.doctorAmount);
      const ar = amountToReceive(a, taxRates);
      if (ar !== null) totalToReceiveOriginal += ar;
      if (unifiedCurrency === null) unifiedCurrency = a.order.doctorAmountCurrency;
      else if (unifiedCurrency !== a.order.doctorAmountCurrency)
        mixedCurrency = true;
    }
    return {
      totalDoctorOriginal,
      totalToReceiveOriginal,
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

  const onSubmit = async (values: RegisterPaymentValues) => {
    if (!grouping.ok) {
      notify.error(grouping.reason);
      return;
    }
    try {
      await accountsPayableGateway.registerPayment({
        payableIds: accounts.map((a) => a.id),
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
      notify.success(`Pago registrado en ${accounts.length} cuenta(s)`);
      navigate('/accounts-payable');
    } catch (err) {
      notify.fromError(err, 'No se pudo registrar el pago');
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
                Registrar pago
              </h1>
              <p className="text-sm text-muted-foreground">
                {accounts.length} cuenta{accounts.length === 1 ? '' : 's'} por pagar
                seleccionada{accounts.length === 1 ? '' : 's'}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/accounts-payable')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver
            </button>
          </div>

          {!grouping.ok && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
              {grouping.reason}. Solo se pueden agrupar cuentas del mismo doctor o
              centro de atención.
            </div>
          )}

          <FormSection
            title="Cuentas seleccionadas"
            description="Resumen de los montos a saldar."
          >
            <ul className="text-sm divide-y">
              {accounts.map((a) => {
                const ar = amountToReceive(a, taxRates);
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium font-mono">
                        N° {a.order.orderNumber}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {recipientName(a)} ·{' '}
                        {a.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
                      </div>
                    </div>
                    <div className="text-sm font-mono shrink-0">
                      {ar !== null
                        ? `${ar.toFixed(2)} ${a.order.doctorAmountCurrency}`
                        : '—'}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t pt-3 mt-1 flex items-center justify-between text-sm font-semibold">
              <span>Total a pagar</span>
              <span className="font-mono">
                {totals.mixedCurrency
                  ? '—'
                  : `${totals.totalToReceiveOriginal.toFixed(2)} ${totals.currency ?? ''}`}
              </span>
            </div>
            {totals.mixedCurrency && (
              <p className="text-xs text-muted-foreground italic">
                Las cuentas seleccionadas tienen montos en monedas diferentes — total
                no agregable.
              </p>
            )}
          </FormSection>

          <FormSection
            title="Pagos"
            description="Mismo componente de pagos usado al crear órdenes. Se aceptan múltiples pagos."
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
                  <div className="text-xs text-muted-foreground">Total pagos</div>
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
                onClick={() => navigate('/accounts-payable')}
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
                {formState.isSubmitting ? 'Guardando…' : 'Registrar pago'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
