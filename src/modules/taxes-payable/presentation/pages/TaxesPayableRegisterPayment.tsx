import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronDown, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { FormSection } from '@/components/ui/form-section';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { getHttpErrorMessage } from '@/lib/api';
import { orderPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  paymentInOrderCurrency,
  type PaymentItemErrors,
  type PaymentLockedFields,
  type PaymentMethodInfo,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { taxesPayableGateway } from '../../infrastructure/taxesPayableGateway';
import { Badge } from '@/components/ui/badge';
import {
  billingRateBs,
  canSelectForPayment,
  paidBs,
  paidOriginal,
  pendingBs,
  pendingOriginal,
  recipientName,
  taxAmount,
  type TaxPayable,
} from '../../domain/models/taxesPayable';
import {
  PAYMENT_TYPE_LABEL,
  type OrderCurrency,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { DoctorPaymentMethod } from '@/modules/doctors/domain/models/doctor';
import type { CareCenterPaymentMethod } from '@/modules/care-centers/domain/models/careCenter';
import type { Bank } from '@/modules/banks/domain/models/bank';

const registerPaymentSchema = z.object({
  payments: z.array(orderPaymentSchema).min(1, 'Registrá al menos un pago'),
});
type RegisterPaymentValues = z.infer<typeof registerPaymentSchema>;

type LocationState = { taxPayableIds?: string[] } | null;

type SavedPaymentMethod = DoctorPaymentMethod | CareCenterPaymentMethod;

const STANDARD_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_foreign',
  'cash_bs',
  'other',
];

export function TaxesPayableRegisterPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const initialIds = useMemo(() => state?.taxPayableIds ?? [], [state?.taxPayableIds]);
  const [taxPayableIds, setTaxPayableIds] = useState<string[]>(initialIds);
  const [candidates, setCandidates] = useState<TaxPayable[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidatesOpen, setCandidatesOpen] = useState(false);

  const [accounts, setAccounts] = useState<TaxPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<(PaymentMethodInfo | null)[]>([]);
  const [lockedFields, setLockedFields] = useState<(PaymentLockedFields | null)[]>(
    [],
  );

  const methods = useForm<RegisterPaymentValues>({
    resolver: zodResolver(registerPaymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, setValue, getValues } = methods;

  useEffect(() => {
    if (initialIds.length === 0) {
      notify.warning('No hay cuentas seleccionadas');
      navigate('/taxes-payable', { replace: true });
    }
  }, [initialIds, navigate]);

  const load = useCallback(async () => {
    if (taxPayableIds.length === 0) return;
    setLoading(true);
    try {
      const items = await Promise.all(
        taxPayableIds.map((id) => taxesPayableGateway.getById(id)),
      );
      setAccounts(items);
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudieron cargar las cuentas'));
      navigate('/taxes-payable');
    } finally {
      setLoading(false);
    }
  }, [taxPayableIds, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bankGateway
      .list()
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  const recipient = useMemo(() => {
    if (accounts.length === 0) return null;
    const doctorIds = new Set(accounts.map((a) => a.doctorId).filter(Boolean));
    const careCenterIds = new Set(accounts.map((a) => a.careCenterId).filter(Boolean));
    if (doctorIds.size === 1 && careCenterIds.size === 0) {
      const id = [...doctorIds][0] as string;
      return { kind: 'doctor' as const, id };
    }
    if (careCenterIds.size === 1 && doctorIds.size === 0) {
      const id = [...careCenterIds][0] as string;
      return { kind: 'care_center' as const, id };
    }
    return null;
  }, [accounts]);

  useEffect(() => {
    if (!recipient) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await taxesPayableGateway.list({
          [recipient.kind === 'doctor' ? 'doctorId' : 'careCenterId']: recipient.id,
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
  }, [recipient]);

  const eligibleCandidates = useMemo(() => {
    const selectedSet = new Set(taxPayableIds);
    const term = candidateSearch.trim().toLowerCase();
    return candidates
      .filter((c) => !selectedSet.has(c.id))
      .filter((c) => canSelectForPayment(c))
      .filter((c) => {
        if (!term) return true;
        const num = String(c.order?.orderNumber ?? '').toLowerCase();
        const tNum = String(c.taxPayableNumber ?? '').toLowerCase();
        return num.includes(term) || tNum.includes(term);
      });
  }, [candidates, taxPayableIds, candidateSearch]);

  const toggleCandidate = (id: string) => {
    setTaxPayableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const removeSelected = (id: string) => {
    if (taxPayableIds.length <= 1) {
      notify.warning('Debe quedar al menos una cuenta seleccionada');
      return;
    }
    setTaxPayableIds((prev) => prev.filter((x) => x !== id));
  };

  useEffect(() => {
    if (!recipient) {
      setSavedMethods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entity =
          recipient.kind === 'doctor'
            ? await doctorGateway.getById(recipient.id)
            : await careCenterGateway.getById(recipient.id);
        if (cancelled) return;
        const list = (entity.paymentMethods ?? []).filter(
          (m) => m.isActive !== false,
        );
        setSavedMethods(list);
      } catch {
        if (!cancelled) setSavedMethods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipient]);

  const bankName = useCallback(
    (code?: string | null) => {
      if (!code) return null;
      return banks.find((b) => b.code === code)?.name ?? code;
    },
    [banks],
  );

  const savedMethodLabel = useCallback(
    (m: SavedPaymentMethod): string => {
      const typeLabel = PAYMENT_TYPE_LABEL[m.type as OrderPaymentType];
      const parts: string[] = [typeLabel];
      if (m.type === 'mobile_payment') {
        if (m.bankCode) parts.push(bankName(m.bankCode) ?? m.bankCode);
        if (m.phoneNumber) parts.push(m.phoneNumber);
      } else if (m.type === 'bank_transfer') {
        if (m.bankCode) parts.push(bankName(m.bankCode) ?? m.bankCode);
        if (m.accountNumber) {
          const last4 = m.accountNumber.slice(-4);
          parts.push(`****${last4}`);
        }
      } else if (m.type === 'other') {
        if (m.description) parts.push(m.description);
        else if (m.accountNumber) parts.push(m.accountNumber);
      }
      return parts.join(' · ');
    },
    [bankName],
  );

  // Moneda original = primera taxAmountCurrency. Si todas comparten, usable.
  const orderCurrency: OrderCurrency = useMemo(() => {
    const first = accounts[0]?.taxAmountCurrency ?? accounts[0]?.order.priceCurrency;
    return ((first ?? 'USD') as OrderCurrency);
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

  const totals = useMemo(() => {
    let totalToReceiveOriginal = 0;
    let totalPaidBs = 0;
    let totalPaidOriginal = 0;
    let totalPendingBs = 0;
    let totalPendingOriginal = 0;
    let unifiedCurrency: string | null = null;
    let mixedCurrency = false;
    for (const a of accounts) {
      const amt = taxAmount(a);
      if (amt === null) continue;
      totalToReceiveOriginal += amt;
      totalPaidBs += paidBs(a);
      const pdOrig = paidOriginal(a);
      if (pdOrig !== null) totalPaidOriginal += pdOrig;
      const pBs = pendingBs(a);
      if (pBs !== null) totalPendingBs += pBs;
      const pOrig = pendingOriginal(a);
      if (pOrig !== null) totalPendingOriginal += pOrig;
      if (unifiedCurrency === null) unifiedCurrency = a.taxAmountCurrency ?? null;
      else if (unifiedCurrency !== a.taxAmountCurrency) mixedCurrency = true;
    }
    return {
      totalToReceiveOriginal,
      totalPaidBs,
      totalPaidOriginal,
      totalPendingBs,
      totalPendingOriginal,
      currency: unifiedCurrency,
      mixedCurrency,
    };
  }, [accounts]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const paymentDefaults = (type: OrderPaymentType): OrderPaymentValues => {
    const base = {
      type,
      paymentDate: todayIso,
      referenceNumber: '',
      bankCode: '',
      exchangeRateId: currentRate?.id ?? '',
      accountNumber: '',
      amountValue: 0,
    };
    if (type === 'mobile_payment' || type === 'bank_transfer' || type === 'cash_bs') {
      return { ...base, amountCurrency: 'BS' };
    }
    return { ...base, amountCurrency: orderCurrency as 'USD' | 'EUR' };
  };

  const addStandardPayment = (type: OrderPaymentType) => {
    const next = [...(getValues('payments') ?? []), paymentDefaults(type)];
    setValue('payments', next, { shouldDirty: true });
    setSnapshots((s) => [...s, null]);
    setLockedFields((l) => [...l, null]);
  };

  const addPaymentFromSavedMethod = (methodId: string) => {
    const m = savedMethods.find((x) => x.id === methodId);
    if (!m) return;
    const type = m.type as OrderPaymentType;
    const base = paymentDefaults(type);
    const next: OrderPaymentValues = {
      ...base,
      bankCode: m.bankCode ?? '',
      accountNumber: m.accountNumber ?? '',
    };
    const info: PaymentMethodInfo = {
      label: `Método registrado: ${PAYMENT_TYPE_LABEL[type]}`,
      bankName: bankName(m.bankCode),
      accountHolderName: m.accountHolderName ?? null,
      idDocument: m.idDocument ?? null,
      phoneNumber: m.phoneNumber ?? null,
      description: m.description ?? null,
    };
    const lock: PaymentLockedFields =
      type === 'mobile_payment' || type === 'bank_transfer'
        ? { type: true, bankCode: true }
        : { type: true, accountNumber: !!m.accountNumber };
    const nextPayments = [...(getValues('payments') ?? []), next];
    setValue('payments', nextPayments, { shouldDirty: true });
    setSnapshots((s) => [...s, info]);
    setLockedFields((l) => [...l, lock]);
    setSelectedSavedMethodId('');
  };

  const removePaymentAt = (idx: number) => {
    const current = getValues('payments') ?? [];
    setValue(
      'payments',
      current.filter((_, i) => i !== idx),
      { shouldDirty: true },
    );
    setSnapshots((s) => s.filter((_, i) => i !== idx));
    setLockedFields((l) => l.filter((_, i) => i !== idx));
  };

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

  // Tasa de facturación del primer account (para mostrar Bs en pendiente).
  const firstBillingRate = useMemo(() => {
    if (accounts.length === 0) return null;
    return billingRateBs(accounts[0]);
  }, [accounts]);
  void firstBillingRate;

  const onSubmit = async (values: RegisterPaymentValues) => {
    if (!grouping.ok) {
      notify.error(grouping.reason);
      return;
    }
    try {
      await taxesPayableGateway.registerPayment({
        taxPayableIds: accounts.map((a) => a.id),
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
      navigate('/taxes-payable');
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
                {accounts.length} cuenta{accounts.length === 1 ? '' : 's'} de impuesto
                seleccionada{accounts.length === 1 ? '' : 's'}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/taxes-payable')}
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
            description="Resumen del impuesto a saldar."
          >
            <div className="flex justify-end mb-2">
              <Popover open={candidatesOpen} onOpenChange={setCandidatesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!recipient}
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
                        Sin cuentas disponibles para este destinatario.
                      </p>
                    ) : (
                      eligibleCandidates.map((c) => {
                        const amt = taxAmount(c);
                        return (
                          <label
                            key={c.id}
                            className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                          >
                            <Checkbox
                              checked={taxPayableIds.includes(c.id)}
                              onCheckedChange={() => toggleCandidate(c.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono font-semibold">
                                  {c.taxPayableNumber}
                                </span>
                                <span className="text-muted-foreground">
                                  · N° orden{' '}
                                  <span className="font-mono">
                                    {c.order.orderNumber}
                                  </span>
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {amt !== null
                                  ? `${amt.toFixed(2)} ${c.taxAmountCurrency ?? ''}`
                                  : '—'}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <ul className="text-sm divide-y">
              {accounts.map((a) => {
                const amt = taxAmount(a);
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
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-sm font-mono">
                        {amt !== null
                          ? `${amt.toFixed(2)} ${a.taxAmountCurrency ?? ''}`
                          : '—'}
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
                );
              })}
            </ul>
            <div className="border-t pt-3 mt-1 flex items-center justify-between text-sm font-semibold">
              <span>Total a pagar al fisco</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a pagar
                </div>
                <div className="text-lg font-semibold">
                  {totals.mixedCurrency
                    ? '—'
                    : `${totals.totalToReceiveOriginal.toFixed(2)} ${totals.currency ?? ''}`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Ya pagado
                </div>
                <div className="text-lg font-semibold">
                  {totals.mixedCurrency
                    ? `${totals.totalPaidBs.toFixed(2)} Bs.`
                    : `${totals.totalPaidOriginal.toFixed(2)} ${totals.currency ?? ''}`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {totals.totalPendingBs <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
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
                {totals.totalPendingBs > 0.01 && (
                  <div className="text-xs text-muted-foreground">
                    Faltan{' '}
                    <span className="font-mono">
                      Bs.{' '}
                      {totals.totalPendingBs.toLocaleString('es-VE', {
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
            title="Pagos"
            description="Pre-cargá un método registrado del destinatario relacionado o agregá un pago manual."
          >
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <Label className="text-xs">Método de pago registrado</Label>
                  <Select
                    value={selectedSavedMethodId}
                    onValueChange={(v) => setSelectedSavedMethodId(v)}
                    disabled={savedMethods.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          savedMethods.length === 0
                            ? 'No hay métodos registrados activos'
                            : 'Seleccioná un método registrado'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {savedMethods.map((m) => (
                        <SelectItem key={m.id} value={m.id ?? ''}>
                          {savedMethodLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => addPaymentFromSavedMethod(selectedSavedMethodId)}
                  disabled={!selectedSavedMethodId}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar pago con este método
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Banco y cuenta quedan bloqueados con los datos registrados. Sólo
                ingresá referencia, monto y fecha.
              </p>
            </div>

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
                    hideAddButtons
                    lockedFields={lockedFields}
                    methodInfo={snapshots}
                    onRemovePayment={removePaymentAt}
                  />
                );
              }}
            />

            <div className="flex flex-wrap gap-2 mt-3">
              {STANDARD_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addStandardPayment(t)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> {PAYMENT_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>

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
                onClick={() => navigate('/taxes-payable')}
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
