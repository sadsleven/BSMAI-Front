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
import { formatMoney } from '@/lib/format/money';
import { orderPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  paymentInBs,
  paymentInUsd,
  type PaymentItemErrors,
  type PaymentLockedFields,
  type PaymentMethodInfo,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import { Badge } from '@/components/ui/badge';
import {
  amountToReceiveUsd,
  canSelectForPayment,
  paidUsd,
  pendingUsd,
  recipientName,
  type AccountsPayable,
} from '../../domain/models/accountsPayable';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { useTaxUnit } from '@/lib/taxes/useTaxUnit';
import { calcRetention, type SeniatPersonType } from '@/lib/taxes/seniatRetention';
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

type LocationState = { payableIds?: string[] } | null;

type SavedPaymentMethod = DoctorPaymentMethod | CareCenterPaymentMethod;

const STANDARD_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_usd',
  'cash_eur',
  'cash_bs',
  'other',
];

export function AccountsPayableRegisterPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const initialIds = useMemo(() => state?.payableIds ?? [], [state?.payableIds]);
  const [payableIds, setPayableIds] = useState<string[]>(initialIds);
  const [candidates, setCandidates] = useState<AccountsPayable[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidatesOpen, setCandidatesOpen] = useState(false);

  const [accounts, setAccounts] = useState<AccountsPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState<ExchangeRate | null>(null);
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<(PaymentMethodInfo | null)[]>([]);
  const [lockedFields, setLockedFields] = useState<(PaymentLockedFields | null)[]>(
    [],
  );
  const { taxUnit } = useTaxUnit();
  const [personType, setPersonType] = useState<SeniatPersonType | null>(null);

  const methods = useForm<RegisterPaymentValues>({
    resolver: zodResolver(registerPaymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, setValue, getValues } = methods;

  useEffect(() => {
    if (initialIds.length === 0) {
      notify.warning('No hay cuentas seleccionadas');
      navigate('/accounts-payable', { replace: true });
    }
  }, [initialIds, navigate]);

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
        const res = await accountsPayableGateway.list({
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
    const selectedSet = new Set(payableIds);
    const term = candidateSearch.trim().toLowerCase();
    return candidates
      .filter((c) => !selectedSet.has(c.id))
      .filter((c) => canSelectForPayment(c))
      .filter((c) => {
        if (!term) return true;
        const num = String(c.order?.orderNumber ?? '').toLowerCase();
        const pNum = String(c.payableNumber ?? '').toLowerCase();
        return num.includes(term) || pNum.includes(term);
      });
  }, [candidates, payableIds, candidateSearch]);

  const toggleCandidate = (id: string) => {
    setPayableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const removeSelected = (id: string) => {
    if (payableIds.length <= 1) {
      notify.warning('Debe quedar al menos una cuenta seleccionada');
      return;
    }
    setPayableIds((prev) => prev.filter((x) => x !== id));
  };

  useEffect(() => {
    if (!recipient) {
      setSavedMethods([]);
      setPersonType(null);
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
        if (recipient.kind === 'care_center') {
          setPersonType('legal_entity');
        } else {
          const isLegal = !!(entity as { isLegalEntity?: boolean }).isLegalEntity;
          setPersonType(isLegal ? 'legal_entity' : 'natural');
        }
      } catch {
        if (!cancelled) {
          setSavedMethods([]);
          setPersonType(null);
        }
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
    let totalToReceive = 0;
    let totalPaid = 0;
    let totalPending = 0;
    for (const a of accounts) {
      const ar = amountToReceiveUsd(a);
      if (ar !== null) totalToReceive += ar;
      totalPaid += paidUsd(a);
      const pu = pendingUsd(a);
      if (pu !== null) totalPending += pu;
    }
    return { totalToReceive, totalPaid, totalPending };
  }, [accounts]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const paymentDefaults = (type: OrderPaymentType): OrderPaymentValues => {
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
      return { ...base, exchangeRateId: usdRate?.id ?? '', amountCurrency: 'BS' };
    }
    if (type === 'cash_usd') return { ...base, amountCurrency: 'USD' };
    if (type === 'cash_eur') return { ...base, amountCurrency: 'EUR' };
    return { ...base, amountCurrency: 'USD' };
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

  /**
   * Retención SENIAT preview: se calcula sobre el bruto total del lote, en Bs,
   * usando la UT vigente y el régimen del proveedor. El proveedor debe recibir
   * el NETO; el monto retenido se entrega al SENIAT vía `taxes_payable`.
   */
  const retentionPreview = useMemo(() => {
    const usdBs = Number(usdRate?.amountBs ?? 0);
    const utBs = Number(taxUnit?.amountBs ?? 0);
    if (!usdBs || usdBs <= 0 || !utBs || utBs <= 0 || !personType) return null;
    const totalGrossUsd = totals.totalToReceive;
    const totalGrossBs = Math.round(totalGrossUsd * usdBs * 100) / 100;
    const r = calcRetention({ grossBs: totalGrossBs, personType, taxUnitBs: utBs });
    const netBs = Math.round((totalGrossBs - r.taxAmountBs) * 100) / 100;
    return { totalGrossUsd, totalGrossBs, netBs, retention: r };
  }, [usdRate, taxUnit, personType, totals.totalToReceive]);

  const paymentsMatchNet =
    retentionPreview !== null &&
    Math.abs(totalPaymentsBs - retentionPreview.netBs) <= 0.01;

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
            description="Resumen de los montos USD a saldar."
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
                        const ar = amountToReceiveUsd(c);
                        return (
                          <label
                            key={c.id}
                            className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                          >
                            <Checkbox
                              checked={payableIds.includes(c.id)}
                              onCheckedChange={() => toggleCandidate(c.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono font-semibold">
                                  {c.payableNumber}
                                </span>
                                <span className="text-muted-foreground">
                                  · N° orden{' '}
                                  <span className="font-mono">
                                    {c.order.orderNumber}
                                  </span>
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {ar !== null ? `${formatMoney(ar)} USD` : '—'}
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
                const ar = amountToReceiveUsd(a);
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
                        {ar !== null ? `${formatMoney(ar)} USD` : '—'}
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
              <span>Total a pagar</span>
              <span className="font-mono">{formatMoney(totals.totalToReceive)} USD</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a pagar
                </div>
                <div className="text-lg font-semibold">
                  {formatMoney(totals.totalToReceive)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Ya pagado
                </div>
                <div className="text-lg font-semibold">
                  {formatMoney(totals.totalPaid)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {totals.totalPending <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-warning text-white">
                      Faltan {formatMoney(totals.totalPending)} USD
                    </Badge>
                  )}
                </div>
                {totals.totalPending > 0.01 && usdRate ? (
                  <div className="text-xs text-muted-foreground">
                    Faltan{' '}
                    <span className="font-mono">
                      Bs{' '}
                      {formatMoney(totals.totalPending * Number(usdRate.amountBs))}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Pagos"
            description="Pre-cargá un método registrado del doctor/centro o agregá un pago manual."
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
                    usdRate={usdRate}
                    onEurRateLoaded={(r) =>
                      setEurRatesById((prev) =>
                        prev[r.id] ? prev : { ...prev, [r.id]: r },
                      )
                    }
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

            {usdRate ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Total pagos</div>
                  <div className="font-mono">
                    {formatMoney(totalPaymentsBs)} Bs.
                    <span className="ml-2 text-muted-foreground">
                      ({formatMoney(totalPaymentsUsd)} USD)
                    </span>
                  </div>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Tasa USD</div>
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

          <FormSection
            title="Retención de ISLR (Decreto 1.808)"
            description="Cálculo SENIAT sobre el bruto del lote. El proveedor recibe el neto; lo retenido genera un impuesto por pagar al SENIAT."
          >
            {!taxUnit ? (
              <p className="text-sm text-destructive">
                No hay Unidad Tributaria vigente. Cargá una en{' '}
                <a href="/tax-units" className="underline">
                  /tax-units
                </a>{' '}
                antes de registrar el pago.
              </p>
            ) : !retentionPreview || !personType ? (
              <p className="text-sm text-muted-foreground">
                Cargando datos del proveedor para calcular la retención…
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-md border p-2 bg-muted/30">
                    <div className="text-[11px] text-muted-foreground">Régimen</div>
                    <div className="font-medium">
                      {personType === 'legal_entity'
                        ? 'Persona Jurídica (5%)'
                        : 'Persona Natural (3%)'}
                    </div>
                  </div>
                  <div className="rounded-md border p-2 bg-muted/30">
                    <div className="text-[11px] text-muted-foreground">UT vigente</div>
                    <div className="font-mono">
                      Bs. {formatMoney(taxUnit.amountBs)}
                    </div>
                  </div>
                  <div className="rounded-md border p-2 bg-muted/30">
                    <div className="text-[11px] text-muted-foreground">Sustraendo</div>
                    <div className="font-mono">
                      {formatMoney(retentionPreview.retention.subtrahendBs)} Bs.
                    </div>
                  </div>
                  <div className="rounded-md border p-2 bg-muted/30">
                    <div className="text-[11px] text-muted-foreground">Umbral PNR</div>
                    <div className="font-mono">
                      {formatMoney(retentionPreview.retention.thresholdBs)} Bs.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 bg-muted/30">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
                      Bruto a facturar
                    </div>
                    <div className="text-lg font-semibold font-mono">
                      {formatMoney(retentionPreview.totalGrossBs)} Bs.
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      ({formatMoney(retentionPreview.totalGrossUsd)} USD)
                    </div>
                  </div>
                  <div className="rounded-md border p-3 bg-warning-soft text-warning-strong">
                    <div className="text-[11px] uppercase tracking-[0.06em]">
                      Retención al SENIAT
                    </div>
                    <div className="text-lg font-semibold font-mono">
                      {formatMoney(retentionPreview.retention.taxAmountBs)} Bs.
                    </div>
                    <div className="text-[11px] font-mono">
                      tasa {formatMoney(retentionPreview.retention.taxRate * 100, { decimals: 0 })}%
                      {retentionPreview.retention.belowThreshold
                        ? ' · bajo umbral'
                        : retentionPreview.retention.subtrahendBs > 0
                          ? ` − ${formatMoney(retentionPreview.retention.subtrahendBs)} Bs.`
                          : ''}
                    </div>
                  </div>
                  <div className="rounded-md border p-3 bg-success-soft text-success-strong">
                    <div className="text-[11px] uppercase tracking-[0.06em]">
                      Neto al proveedor
                    </div>
                    <div className="text-lg font-semibold font-mono">
                      {formatMoney(retentionPreview.netBs)} Bs.
                    </div>
                    <div className="text-[11px] font-mono">
                      = bruto − retención
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
                      Validación
                    </div>
                    <div className="text-xs text-muted-foreground">
                      La suma de pagos al proveedor debe igualar el neto en Bs.
                    </div>
                  </div>
                  {paymentsMatchNet ? (
                    <Badge className="bg-success text-white">Cuadrado</Badge>
                  ) : (
                    <Badge className="bg-warning text-white">
                      Diferencia{' '}
                      {formatMoney(totalPaymentsBs - retentionPreview.netBs)} Bs.
                    </Badge>
                  )}
                </div>
              </div>
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
                  !usdRate ||
                  !taxUnit ||
                  watchedPayments.length === 0 ||
                  !paymentsMatchNet
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
