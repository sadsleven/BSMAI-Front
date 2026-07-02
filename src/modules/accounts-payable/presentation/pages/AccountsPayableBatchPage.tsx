import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { FormSection } from '@/components/ui/form-section';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { egressPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  paymentInBs,
  type PaymentItemErrors,
  type RecipientPaymentMethod,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { UsdRateSelect } from '@/modules/exchange-rates/presentation/components/UsdRateSelect';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import { useTaxUnit } from '@/lib/taxes/useTaxUnit';
import { TaxUnitSelect } from '@/modules/tax-units/presentation/components/TaxUnitSelect';
import type { TaxUnit } from '@/modules/tax-units/domain/models/taxUnit';
import {
  calcRetention,
  type RetentionResult,
  type SeniatPersonType,
} from '@/lib/taxes/seniatRetention';
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import {
  orderInternalNumber,
  pendingProviderId,
  pendingProviderName,
  personTypeOf,
  recipientName,
  type AccountsPayableBatch,
  type PendingPayable,
} from '../../domain/models/accountsPayable';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const paymentSchema = z.object({
  payments: z.array(egressPaymentSchema).min(1, 'Registra al menos un pago'),
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

const STANDARD_TYPES: OrderPaymentType[] = [
  'mobile_payment',
  'bank_transfer',
  'cash_usd',
  'cash_eur',
  'cash_bs',
  'other',
];

type CreateState = {
  recipientType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  internalOrderIds: string[];
} | null;

type CreateProvider = {
  recipientType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
};

function buildPaymentErrors(
  raw: unknown,
): PaymentItemErrors[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return (raw as Array<Record<string, { message?: string } | undefined> | undefined>).map(
    (e) =>
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
  );
}

export function AccountsPayableBatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isCreate = !id;
  const createState = (location.state as CreateState) ?? null;

  // ---------------- Create mode ----------------
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingPayable[]>([]);
  const [createLoading, setCreateLoading] = useState(isCreate);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(createState?.internalOrderIds ?? []),
  );
  const [search, setSearch] = useState('');
  // UT del lote: por defecto la vigente, pero el usuario puede elegir otra.
  const { taxUnit: currentTaxUnit } = useTaxUnit();
  const [selectedTaxUnit, setSelectedTaxUnit] = useState<TaxUnit | null>(null);
  const batchTaxUnit = selectedTaxUnit ?? currentTaxUnit;
  // Si vino selección de la lista, fijamos el proveedor de entrada.
  const lockedProvider = useMemo<CreateProvider | null>(
    () =>
      createState
        ? {
            recipientType: createState.recipientType,
            providerId: createState.providerId,
            providerName: createState.providerName,
          }
        : null,
    [createState],
  );

  useEffect(() => {
    if (!isCreate) return;
    let cancelled = false;
    (async () => {
      setCreateLoading(true);
      setCreateError(null);
      try {
        // Con proveedor fijado (vino de la lista), traemos sólo sus pendientes:
        // así el buscador muestra únicamente órdenes de ese doctor/centro.
        const res = await accountsPayableGateway.listPending({
          limit: 200,
          ...(lockedProvider
            ? lockedProvider.recipientType === 'doctor'
              ? { doctorId: lockedProvider.providerId }
              : { careCenterId: lockedProvider.providerId }
            : {}),
        });
        if (cancelled) return;
        setPending(res.data);
      } catch (e) {
        if (!cancelled)
          setCreateError(
            getHttpErrorMessage(e, 'No se pudieron cargar las órdenes pendientes'),
          );
      } finally {
        if (!cancelled) setCreateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCreate, lockedProvider]);

  const selectedRows = useMemo(
    () => pending.filter((p) => selected.has(p.internalOrderId)),
    [pending, selected],
  );

  // Proveedor derivado: fijado por router state o por la primera fila marcada.
  const activeProvider = useMemo<CreateProvider | null>(() => {
    if (lockedProvider) return lockedProvider;
    if (selectedRows.length === 0) return null;
    const first = selectedRows[0];
    return {
      recipientType: first.providerType,
      providerId: pendingProviderId(first) as string,
      providerName: pendingProviderName(first),
    };
  }, [lockedProvider, selectedRows]);

  const providerKey = activeProvider
    ? `${activeProvider.recipientType}:${activeProvider.providerId}`
    : null;

  const sameProvider = useMemo(
    () =>
      selectedRows.every(
        (r) => `${r.providerType}:${pendingProviderId(r)}` === providerKey,
      ),
    [selectedRows, providerKey],
  );

  const canCreate = selectedRows.length >= 1 && !!activeProvider && sameProvider;

  // Resultados del buscador: sólo al escribir, excluye las ya agregadas y
  // (con proveedor activo) restringe a ese mismo doctor/centro.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pending.filter((p) => {
      if (selected.has(p.internalOrderId)) return false;
      if (
        providerKey &&
        `${p.providerType}:${pendingProviderId(p)}` !== providerKey
      )
        return false;
      return (
        p.internalNumber.toLowerCase().includes(q) ||
        p.orderNumber.toLowerCase().includes(q) ||
        pendingProviderName(p).toLowerCase().includes(q)
      );
    });
  }, [pending, search, selected, providerKey]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedTotalUsd = useMemo(
    () => selectedRows.reduce((s, p) => s + Number(p.grossUsd || 0), 0),
    [selectedRows],
  );

  const onCreate = async () => {
    if (!canCreate || !activeProvider) return;
    setCreating(true);
    try {
      const batch = await accountsPayableGateway.createBatch({
        recipientType: activeProvider.recipientType,
        doctorId:
          activeProvider.recipientType === 'doctor'
            ? activeProvider.providerId
            : undefined,
        careCenterId:
          activeProvider.recipientType === 'care_center'
            ? activeProvider.providerId
            : undefined,
        taxUnitId: batchTaxUnit?.id,
        internalOrderIds: selectedRows.map((r) => r.internalOrderId),
      });
      notify.success('Lote creado');
      navigate(`/accounts-payable/${batch.id}`, { replace: true });
    } catch (e) {
      notify.fromError(e, 'No se pudo crear el lote');
    } finally {
      setCreating(false);
    }
  };

  if (isCreate) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PageBreadcrumbs />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Realizar pago
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeProvider
                ? `Proveedor: ${activeProvider.providerName} · ${
                    activeProvider.recipientType === 'doctor' ? 'Doctor' : 'Centro'
                  }`
                : 'Selecciona las órdenes internas pendientes de un mismo proveedor.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/accounts-payable?tab=pending')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver
          </button>
        </div>

        <FormSection
          title="Órdenes del lote"
          description="Estas órdenes internas forman el lote. Busca para agregar más órdenes del mismo proveedor."
        >
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por N° orden interna, N° orden o proveedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>

          {createError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-2.5 text-sm text-destructive">
              {createError}
            </div>
          ) : createLoading ? (
            <p className="text-sm text-muted-foreground">Cargando órdenes…</p>
          ) : (
            <>
              {/* Resultados del buscador: agregar al lote */}
              {search.trim() ? (
                <div className="mb-4 rounded-lg border divide-y overflow-hidden">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {activeProvider
                        ? `Sin órdenes pendientes de este proveedor para “${search}”.`
                        : `Sin resultados para “${search}”.`}
                    </p>
                  ) : (
                    candidates.map((p) => (
                      <button
                        type="button"
                        key={p.internalOrderId}
                        onClick={() => toggleSelect(p.internalOrderId)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold">
                            N° {p.internalNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {pendingProviderName(p)} ·{' '}
                            {p.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm">
                            {formatMoney(p.grossUsd)} USD
                          </span>
                          <Plus className="w-4 h-4 text-brand-blue" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {/* Lista del lote (preseleccionadas + agregadas) */}
              {selectedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No hay órdenes en el lote. Busca y agrega al menos una.
                </p>
              ) : (
                <ul className="text-sm divide-y rounded-lg border">
                  {selectedRows.map((p) => (
                    <li
                      key={p.internalOrderId}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold">
                          N° {p.internalNumber}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {pendingProviderName(p)} ·{' '}
                          {p.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono">{formatMoney(p.grossUsd)} USD</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => toggleSelect(p.internalOrderId)}
                          title="Quitar del lote"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
            <div className="text-[11px] text-muted-foreground font-mono">
              {selectedRows.length} orden(es) · {formatMoney(selectedTotalUsd)} USD
            </div>
            {selectedRows.length > 0 && !sameProvider ? (
              <Badge className="bg-warning text-white shrink-0">
                Hay órdenes de otro proveedor
              </Badge>
            ) : null}
          </div>
        </FormSection>

        <FormSection
          title="Unidad Tributaria"
          description="UT usada para calcular la retención SENIAT del lote. Por defecto la vigente; puedes seleccionar otra."
        >
          <TaxUnitSelect
            className="max-w-md"
            selectedId={batchTaxUnit?.id ?? null}
            selectedFallback={batchTaxUnit}
            onSelect={setSelectedTaxUnit}
          />
        </FormSection>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/accounts-payable?tab=pending')}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onCreate} disabled={creating || !canCreate}>
            {creating ? 'Creando…' : 'Realizar pago'}
          </Button>
        </div>
      </div>
    );
  }

  return <BatchDetail id={id as string} />;
}

// =============================================================================
// Detail (existing batch).
// =============================================================================
function BatchDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { taxUnit } = useTaxUnit();
  const [batch, setBatch] = useState<AccountsPayableBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});
  const [recipientMethods, setRecipientMethods] = useState<RecipientPaymentMethod[]>([]);

  // Add-orders popover.
  const [candidates, setCandidates] = useState<PendingPayable[]>([]);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSel, setCandidateSel] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPaymentDelete, setConfirmPaymentDelete] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBatch(await accountsPayableGateway.getBatch(id));
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudo cargar el lote'));
      navigate('/accounts-payable?tab=batches');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  const isPaid = batch?.status === 'paid';
  const providerId =
    batch?.recipientType === 'doctor' ? batch?.doctorId : batch?.careCenterId;

  // Cuentas registradas del proveedor (para precargar banco/cuenta en el pago).
  const recipientType = batch?.recipientType;
  useEffect(() => {
    if (!providerId || !recipientType) {
      setRecipientMethods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const provider =
          recipientType === 'doctor'
            ? await doctorGateway.getById(providerId)
            : await careCenterGateway.getById(providerId);
        if (cancelled) return;
        setRecipientMethods(
          (provider.paymentMethods ?? [])
            .filter((m) => m.isActive !== false && m.id)
            .map((m) => ({
              id: m.id,
              type: m.type,
              bankCode: m.bankCode,
              phoneNumber: m.phoneNumber,
              idDocument: m.idDocument,
              accountNumber: m.accountNumber,
              accountHolderName: m.accountHolderName,
              description: m.description,
            })),
        );
      } catch {
        if (!cancelled) setRecipientMethods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId, recipientType]);

  // Candidatos para agregar: pendientes del mismo proveedor.
  const loadCandidates = useCallback(async () => {
    if (!batch || !providerId) return;
    try {
      const res = await accountsPayableGateway.listPending({
        [batch.recipientType === 'doctor' ? 'doctorId' : 'careCenterId']: providerId,
        limit: 200,
        search: candidateSearch || undefined,
      });
      setCandidates(res.data);
    } catch {
      setCandidates([]);
    }
  }, [batch, providerId, candidateSearch]);

  useEffect(() => {
    if (candidatesOpen) loadCandidates();
  }, [candidatesOpen, loadCandidates]);

  // Tasa de facturación (USD/Bs) de la primera orden — define el neto en Bs.
  const usdRate = useMemo<ExchangeRate | null>(() => {
    const fr = batch?.orders?.[0]?.internalOrder?.order?.billingExchangeRate;
    if (!fr) return null;
    return {
      id: fr.id,
      currency: fr.currency,
      amountBs: String(fr.amountBs),
      effectiveDate: '',
      isActive: true,
    } as ExchangeRate;
  }, [batch]);

  // ---------------- Payment form ----------------
  const methods = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, setValue, getValues, reset } = methods;
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

  const addPayment = (type: OrderPaymentType) => {
    setValue('payments', [...(getValues('payments') ?? []), paymentDefaults(type)], {
      shouldDirty: true,
    });
  };
  const removePaymentAt = (idx: number) => {
    setValue(
      'payments',
      (getValues('payments') ?? []).filter((_, i) => i !== idx),
      { shouldDirty: true },
    );
  };

  const lookupRate = useCallback(
    (rid: string): ExchangeRate | null =>
      eurRatesById[rid] ?? (usdRate && usdRate.id === rid ? usdRate : null),
    [eurRatesById, usdRate],
  );

  const watchedPayments = methods.watch('payments') ?? [];
  const totalPaymentsBs = useMemo(
    () =>
      watchedPayments.reduce((sum, p) => sum + paymentInBs(p, usdRate, lookupRate), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedPayments, usdRate, eurRatesById],
  );

  // Datos del lote (provistos por el BE).
  const netBs = batch?.netBs ?? 0;
  const priorPaidBs = batch?.paidBs ?? 0;
  const pendingBs = batch?.pendingBs ?? 0;
  const cumulativeBs = Math.round((priorPaidBs + totalPaymentsBs) * 100) / 100;
  const isOver = netBs > 0 && cumulativeBs - netBs > 0.01;
  const isComplete = netBs > 0 && Math.abs(cumulativeBs - netBs) <= 0.01;
  const canRegister = !isPaid && !!usdRate && totalPaymentsBs > 0.01 && !isOver;

  const onSubmitPayment = async (values: PaymentFormValues) => {
    setBusy(true);
    try {
      const payments = values.payments.map((p) => ({
        type: p.type,
        paymentDate: p.paymentDate,
        referenceNumber: p.referenceNumber || undefined,
        bankCode: p.bankCode || undefined,
        accountNumber: p.accountNumber || undefined,
        exchangeRateId: p.exchangeRateId || undefined,
        amountCurrency: p.amountCurrency,
        amountValue: p.amountValue,
      }));
      let updated: AccountsPayableBatch;
      if (editingPaymentId) {
        updated = await accountsPayableGateway.editPayment(
          id,
          editingPaymentId,
          payments[0],
        );
        notify.success('Pago actualizado');
      } else {
        updated = await accountsPayableGateway.registerPayment(id, payments);
        notify.success('Pago registrado');
      }
      setBatch(updated);
      reset({ payments: [] });
      setEditingPaymentId(null);
    } catch (e) {
      notify.fromError(e, 'No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  };

  const startEditPayment = (paymentId: string) => {
    const p = batch?.payments?.find((x) => x.id === paymentId);
    if (!p) return;
    setEditingPaymentId(paymentId);
    reset({
      payments: [
        {
          type: p.type,
          paymentDate: p.paymentDate?.slice(0, 10) || todayIso,
          referenceNumber: p.referenceNumber ?? '',
          bankCode: p.bankCode ?? '',
          accountNumber: p.accountNumber ?? '',
          exchangeRateId: p.exchangeRateId ?? '',
          amountCurrency: p.amountCurrency,
          amountValue: Number(p.amountValue) || 0,
        } as OrderPaymentValues,
      ],
    });
    document.getElementById('ap-payment-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingPaymentId(null);
    reset({ payments: [] });
  };

  const onDeletePayment = async (paymentId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.deletePayment(id, paymentId));
      notify.success('Pago eliminado');
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el pago');
    } finally {
      setBusy(false);
      setConfirmPaymentDelete(null);
    }
  };

  const onAddOrders = async () => {
    const ids = [...candidateSel];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.addOrders(id, ids));
      notify.success('Órdenes agregadas');
      setCandidateSel(new Set());
      setCandidatesOpen(false);
    } catch (e) {
      notify.fromError(e, 'No se pudieron agregar las órdenes');
    } finally {
      setBusy(false);
    }
  };

  const onRemoveOrder = async (internalOrderId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.removeOrders(id, [internalOrderId]));
      notify.success('Orden quitada');
    } catch (e) {
      notify.fromError(e, 'No se pudo quitar la orden');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteBatch = async () => {
    setBusy(true);
    try {
      await accountsPayableGateway.deleteBatch(id);
      notify.success('Lote anulado');
      navigate('/accounts-payable?tab=batches');
    } catch (e) {
      notify.fromError(e, 'No se pudo anular el lote');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const onSetTaxUnit = async (taxUnitId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.setTaxUnit(id, taxUnitId));
      notify.success('Unidad Tributaria actualizada');
    } catch (e) {
      notify.fromError(e, 'No se pudo cambiar la Unidad Tributaria');
    } finally {
      setBusy(false);
    }
  };

  const existingInternalIds = useMemo(
    () => new Set((batch?.orders ?? []).map((o) => o.internalOrderId)),
    [batch],
  );
  const eligibleCandidates = candidates.filter(
    (c) => !existingInternalIds.has(c.internalOrderId),
  );

  if (loading || !batch) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
        Cargando lote…
      </div>
    );
  }

  // Desglose SENIAT (espejo del cálculo del BE) para la sección Resumen.
  // Usa la UT del lote; los lotes previos (sin UT propia) caen a la vigente.
  const seniatPersonType: SeniatPersonType = personTypeOf(batch);
  const effectiveTaxUnit = batch.taxUnit ?? taxUnit;
  const taxUnitBs = effectiveTaxUnit ? Number(effectiveTaxUnit.amountBs) : null;
  const seniatBreakdown: RetentionResult | null =
    taxUnitBs && taxUnitBs > 0
      ? calcRetention({
          grossBs: batch.grossBs ?? 0,
          personType: seniatPersonType,
          taxUnitBs,
        })
      : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Lote de pago N° {batch.payableNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {recipientName(batch)} ·{' '}
            {batch.recipientType === 'doctor' ? 'Doctor' : 'Centro'} · {STATUS_TEXT[batch.status]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/accounts-payable?tab=batches')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
      </div>

      {/* Totales */}
      <FormSection
        title="Resumen"
        description="Bruto, retención de ISLR (Decreto 1.808) y el neto a pagar al proveedor."
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <SummaryTile label="TotalUSD" value={`${formatMoney(batch.grossUsd ?? 0)} USD`} />
          <SummaryTile label="TotalBs." value={`${formatMoney(batch.grossBs ?? 0)} Bs.`} />
          <SummaryTile
            label="Retención SENIAT"
            value={`${formatMoney(batch.retentionBs ?? 0)} Bs.`}
            tone="warning"
          />
          <SummaryTile
            label="Neto a pagar"
            value={`${formatMoney(batch.netBs ?? 0)} Bs.`}
            tone="success"
          />
          <SummaryTile
            label="Falta por pagar"
            value={`${formatMoney(batch.pendingBs ?? 0)} Bs.`}
          />
        </div>

        <SeniatBreakdown
          personType={seniatPersonType}
          grossBs={batch.grossBs ?? 0}
          retentionBs={batch.retentionBs ?? 0}
          taxUnitBs={taxUnitBs}
          result={seniatBreakdown}
        />

        <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
          <div className="mt-4">
            <TaxUnitSelect
              className="max-w-md"
              label="Unidad Tributaria del lote"
              placeholder="UT vigente al calcular"
              selectedId={batch.taxUnitId ?? null}
              selectedFallback={batch.taxUnit ?? null}
              onSelect={(ut) => onSetTaxUnit(ut.id)}
              disabled={isPaid || busy}
              lockNote={
                isPaid
                  ? 'El lote está pagado: edita o quita un pago para cambiar la UT.'
                  : undefined
              }
            />
            {!isPaid ? (
              <p className="text-xs text-muted-foreground mt-1.5">
                Cambiar la UT recalcula la retención y el neto a pagar del lote.
              </p>
            ) : null}
          </div>
        </Can>
      </FormSection>

      {/* Órdenes */}
      <FormSection
        title={`Órdenes del lote (${batch.orders?.length ?? 0})`}
        description="Órdenes internas del proveedor incluidas en este lote."
      >
        {!isPaid ? (
          <div className="flex justify-end mb-2">
            <Popover open={candidatesOpen} onOpenChange={setCandidatesOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={busy}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar órdenes
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
                      placeholder="Buscar por N° orden interna…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {eligibleCandidates.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                      Sin órdenes pendientes para este proveedor.
                    </p>
                  ) : (
                    eligibleCandidates.map((c) => (
                      <label
                        key={c.internalOrderId}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={candidateSel.has(c.internalOrderId)}
                          onCheckedChange={() =>
                            setCandidateSel((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.internalOrderId))
                                next.delete(c.internalOrderId);
                              else next.add(c.internalOrderId);
                              return next;
                            })
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-semibold">
                            N° {c.internalNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatMoney(c.grossUsd)} USD
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <div className="p-2 border-t flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onAddOrders}
                    disabled={candidateSel.size === 0 || busy}
                  >
                    Agregar ({candidateSel.size})
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground mb-2">
            El lote está pagado: edita o quita un pago para modificar sus órdenes.
          </p>
        )}

        <ul className="text-sm divide-y">
          {(batch.orders ?? []).map((o) => (
            <li
              key={o.internalOrderId}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3"
            >
              <span className="font-mono font-medium">
                N° {orderInternalNumber(o)}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono">{formatMoney(o.grossUsd)} USD</span>
                {!isPaid ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveOrder(o.internalOrderId)}
                    title="Quitar"
                    disabled={busy || (batch.orders?.length ?? 0) <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </FormSection>

      {/* Pagos registrados */}
      <FormSection
        title={`Pagos registrados (${batch.payments?.length ?? 0})`}
        description="Pagos aplicados al neto del lote."
      >
        {(batch.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sin pagos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {(batch.payments ?? []).map((p) => (
              <li
                key={p.id}
                className="rounded-lg border bg-card p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-medium">
                    {PAYMENT_TYPE_LABEL[p.type]} ·{' '}
                    {p.paymentDate
                      ? new Date(p.paymentDate).toLocaleDateString('es-VE')
                      : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {formatMoney(p.amountValue)} {p.amountCurrency} ·{' '}
                    {formatMoney(p.amountInBs)} Bs.
                    {p.referenceNumber ? ` · Ref. ${p.referenceNumber}` : ''}
                  </div>
                </div>
                <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEditPayment(p.id)}
                      disabled={busy}
                      title="Editar pago"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmPaymentDelete(p.id)}
                      disabled={busy}
                      title="Eliminar pago"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      {/* Registrar / editar pago */}
      <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
        <div id="ap-payment-form">
          <FormProvider {...methods}>
            <form
              onSubmit={handleSubmit(onSubmitPayment, (errs) => notifyFormErrors(errs))}
            >
              <FormSection
                title={editingPaymentId ? 'Editar pago' : 'Registrar pago'}
                description="El proveedor recibe el neto (bruto − retención SENIAT). Puedes pagar parcial."
              >
                {!usdRate ? (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Las órdenes del lote no tienen tasa de facturación; no se puede
                    registrar el pago.
                  </p>
                ) : (
                  <>
                    <Controller
                      control={control}
                      name="payments"
                      render={({ field }) => (
                        <OrderPaymentForm
                          payments={(field.value ?? []) as OrderPaymentValues[]}
                          onChange={(next) => field.onChange(next)}
                          usdRate={usdRate}
                          onEurRateLoaded={(r) =>
                            setEurRatesById((prev) =>
                              prev[r.id] ? prev : { ...prev, [r.id]: r },
                            )
                          }
                          errors={buildPaymentErrors(
                            (formState.errors as { payments?: unknown }).payments,
                          )}
                          hideAddButtons
                          onRemovePayment={removePaymentAt}
                          usePaymentAccount={false}
                          recipientMethods={recipientMethods}
                        />
                      )}
                    />

                    {!editingPaymentId ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {STANDARD_TYPES.map((t) => (
                          <Button
                            key={t}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addPayment(t)}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> {PAYMENT_TYPE_LABEL[t]}
                          </Button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border p-2 bg-muted/30">
                        <div className="text-xs text-muted-foreground">
                          Total de los pagos cargados
                        </div>
                        <div className="font-mono">{formatMoney(totalPaymentsBs)} Bs.</div>
                      </div>
                      <UsdRateSelect
                        rates={usdRate ? [usdRate] : []}
                        selectedId={usdRate?.id ?? ''}
                        onSelect={() => {}}
                        disabled
                        label="Tasa de facturación"
                        lockNote="Tasa de la orden — define el neto en Bs."
                      />
                    </div>

                    <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Acumulado {formatMoney(cumulativeBs)} / neto{' '}
                        {formatMoney(netBs)} Bs. · ya pagado {formatMoney(priorPaidBs)} Bs.
                      </div>
                      {isComplete ? (
                        <Badge className="bg-success text-white shrink-0">Cuadrado</Badge>
                      ) : isOver ? (
                        <Badge className="bg-destructive text-white shrink-0">
                          Excede {formatMoney(cumulativeBs - netBs)} Bs.
                        </Badge>
                      ) : totalPaymentsBs > 0.01 ? (
                        <Badge className="bg-brand-blue text-white shrink-0">
                          Parcial · falta {formatMoney(netBs - cumulativeBs)} Bs.
                        </Badge>
                      ) : (
                        <Badge className="bg-warning text-white shrink-0">
                          Falta {formatMoney(pendingBs)} Bs.
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4">
                      {editingPaymentId ? (
                        <Button type="button" variant="outline" onClick={cancelEdit}>
                          Cancelar edición
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        disabled={
                          busy ||
                          formState.isSubmitting ||
                          watchedPayments.length === 0 ||
                          (editingPaymentId ? false : !canRegister)
                        }
                      >
                        {busy || formState.isSubmitting
                          ? 'Guardando…'
                          : editingPaymentId
                            ? 'Guardar cambios'
                            : isComplete
                              ? 'Registrar pago'
                              : 'Registrar pago parcial'}
                      </Button>
                    </div>
                  </>
                )}
              </FormSection>
            </form>
          </FormProvider>
        </div>
      </Can>

      {/* Anular lote */}
      <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.SOFT_DELETE}>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive-soft"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Anular lote
          </Button>
        </div>
      </Can>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-xl shadow-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive-soft text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle>Anular lote N° {batch.payableNumber}</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán sus pagos y las órdenes volverán a Pendientes. No se puede
                  anular si la retención ya fue pagada al SENIAT.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteBatch}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Anular lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmPaymentDelete}
        onOpenChange={(o) => !o && setConfirmPaymentDelete(null)}
      >
        <AlertDialogContent className="rounded-xl shadow-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive-soft text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle>Eliminar pago</AlertDialogTitle>
                <AlertDialogDescription>
                  El pago se eliminará y el saldo del lote se recalculará.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmPaymentDelete && onDeletePayment(confirmPaymentDelete)
              }
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const STATUS_TEXT: Record<AccountsPayableBatch['status'], string> = {
  paid: 'Pagado',
  unpaid: 'No pagado',
  partially_paid: 'Pagado parcialmente',
};

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'success';
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'rounded-md border p-2 bg-warning-soft text-warning-strong'
          : tone === 'success'
            ? 'rounded-md border-2 border-success p-2 bg-success-soft text-success-strong'
            : 'rounded-md border p-2 bg-muted/30'
      }
    >
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

/** Desglose paso a paso del cálculo de la retención SENIAT (ISLR, Decreto 1.808). */
function SeniatBreakdown({
  personType,
  grossBs,
  retentionBs,
  taxUnitBs,
  result,
}: {
  personType: SeniatPersonType;
  grossBs: number;
  retentionBs: number;
  taxUnitBs: number | null;
  result: RetentionResult | null;
}) {
  const isLegal = personType === 'legal_entity';
  const regimen = isLegal
    ? 'Persona jurídica domiciliada (5%)'
    : 'Persona natural residente (3%)';

  const tiles: { label: string; value: string; tone?: 'warning' }[] = [];
  if (result) {
    tiles.push({ label: 'Base imponible', value: `${formatMoney(grossBs)} Bs.` });
    tiles.push({ label: 'Tasa aplicada', value: `${(result.taxRate * 100).toFixed(0)}%` });
    if (!isLegal) {
      tiles.push({ label: 'Valor UT', value: `${formatMoney(taxUnitBs ?? 0)} Bs.` });
      tiles.push({ label: 'Sustraendo', value: `${formatMoney(result.subtrahendBs)} Bs.` });
      tiles.push({
        label: 'Mínimo no sujeto',
        value: `${formatMoney(result.thresholdBs)} Bs.`,
      });
    }
    tiles.push(
      result.belowThreshold
        ? { label: 'Retención', value: 'Exento', tone: 'warning' }
        : {
            label: 'Retención',
            value: `${formatMoney(result.taxAmountBs)} Bs.`,
            tone: 'warning',
          },
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Desglose de la retención · ISLR (Decreto 1.808)
        </div>
        <div className="text-xs text-muted-foreground">{regimen}</div>
      </div>
      {!result ? (
        <p className="text-xs italic text-muted-foreground">
          No hay Unidad Tributaria vigente configurada; no se puede desglosar el
          cálculo. La retención mostrada ({formatMoney(retentionBs)} Bs.) proviene del
          servidor.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {tiles.map((t) => (
            <SummaryTile key={t.label} label={t.label} value={t.value} tone={t.tone} />
          ))}
        </div>
      )}
    </div>
  );
}
