import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { orderPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  INCOMING_PAYMENT_TYPES,
  paymentInBs,
  paymentInUsd,
  type PaymentItemErrors,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { useUsdRates } from '@/modules/exchange-rates/presentation/hooks/useUsdRates';
import { UsdRateSelect } from '@/modules/exchange-rates/presentation/components/UsdRateSelect';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import {
  debtorDisplayName,
  pendingDebtorId,
  pendingDebtorName,
  type AccountsReceivableBatch,
  type AccountsReceivableDebtorType,
  type PendingReceivable,
} from '../../domain/models/accountsReceivable';
import { PAYMENT_TYPE_LABEL } from '@/modules/orders/domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const paymentSchema = z.object({
  payments: z.array(orderPaymentSchema).min(1, 'Registrá al menos un cobro'),
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

type CreateState = {
  debtorType: 'insurance' | 'holder';
  debtorId: string;
  debtorName: string;
  useFixedRate?: boolean;
  orderIds: string[];
} | null;

type CreateDebtor = {
  debtorType: AccountsReceivableDebtorType;
  debtorId: string;
  debtorName: string;
  useFixedRate: boolean;
};

function buildPaymentErrors(raw: unknown): PaymentItemErrors[] | undefined {
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
            paymentAccountId: e.paymentAccountId?.message,
            amountCurrency: e.amountCurrency?.message,
            amountValue: e.amountValue?.message,
          }
        : {},
  );
}

export function AccountsReceivableBatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isCreate = !id;
  const createState = (location.state as CreateState) ?? null;

  // ---------------- Create mode ----------------
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingReceivable[]>([]);
  const [createLoading, setCreateLoading] = useState(isCreate);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(createState?.orderIds ?? []),
  );
  const [search, setSearch] = useState('');
  // Si vino selección de la lista, fijamos el deudor + modo de entrada.
  const lockedDebtor = useMemo<CreateDebtor | null>(
    () =>
      createState
        ? {
            debtorType: createState.debtorType,
            debtorId: createState.debtorId,
            debtorName: createState.debtorName,
            useFixedRate: createState.useFixedRate ?? false,
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
        const res = await accountsReceivableGateway.listPending({ limit: 200 });
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
  }, [isCreate]);

  const selectedRows = useMemo(
    () => pending.filter((p) => selected.has(p.orderId)),
    [pending, selected],
  );

  // Deudor + modo derivado: fijado por router state o por la primera fila marcada.
  const activeDebtor = useMemo<CreateDebtor | null>(() => {
    if (lockedDebtor) return lockedDebtor;
    if (selectedRows.length === 0) return null;
    const first = selectedRows[0];
    return {
      debtorType: first.debtorType,
      debtorId: pendingDebtorId(first) as string,
      debtorName: pendingDebtorName(first),
      useFixedRate: first.useFixedRate,
    };
  }, [lockedDebtor, selectedRows]);

  // Misma clave deudor + modo (tasa fija vs USD).
  const debtorKey = activeDebtor
    ? `${activeDebtor.debtorType}:${activeDebtor.debtorId}:${activeDebtor.useFixedRate}`
    : null;

  const sameDebtor = useMemo(
    () =>
      selectedRows.every(
        (r) =>
          `${r.debtorType}:${pendingDebtorId(r)}:${r.useFixedRate}` === debtorKey,
      ),
    [selectedRows, debtorKey],
  );

  const canCreate = selectedRows.length >= 1 && !!activeDebtor && sameDebtor;

  const filteredPending = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter(
      (p) =>
        p.orderNumber.toLowerCase().includes(q) ||
        pendingDebtorName(p).toLowerCase().includes(q),
    );
  }, [pending, search]);

  const toggleSelect = (orderId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });

  const rowOtherDebtor = (p: PendingReceivable): boolean =>
    !!debtorKey &&
    `${p.debtorType}:${pendingDebtorId(p)}:${p.useFixedRate}` !== debtorKey &&
    !selected.has(p.orderId);

  const pendingTargetLabel = (p: PendingReceivable) =>
    p.useFixedRate && p.targetBs !== null
      ? `${formatMoney(p.targetBs)} Bs.`
      : `${formatMoney(p.targetUsd ?? 0)} USD`;

  const onCreate = async () => {
    if (!canCreate || !activeDebtor) return;
    setCreating(true);
    try {
      const batch = await accountsReceivableGateway.createBatch({
        debtorType: activeDebtor.debtorType,
        insuranceId:
          activeDebtor.debtorType === 'insurance' ? activeDebtor.debtorId : undefined,
        holderId:
          activeDebtor.debtorType === 'holder' ? activeDebtor.debtorId : undefined,
        orderIds: selectedRows.map((r) => r.orderId),
      });
      notify.success('Lote creado');
      navigate(`/accounts-receivable/${batch.id}`, { replace: true });
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
              Realizar cobro
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeDebtor
                ? `Deudor: ${activeDebtor.debtorName} · ${
                    activeDebtor.debtorType === 'holder' ? 'Titular' : 'Seguro'
                  }${activeDebtor.useFixedRate ? ' · tasa fija' : ''}`
                : 'Seleccioná las órdenes pendientes de un mismo deudor y modo de cobro.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/accounts-receivable?tab=pending')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver
          </button>
        </div>

        <FormSection
          title="Órdenes pendientes"
          description="Marcá las órdenes a incluir. Todas deben ser del mismo deudor y modo (tasa fija o USD)."
        >
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por N° orden o deudor…"
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
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay órdenes pendientes de cobro.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      N° orden
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Deudor
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      A cobrar
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPending.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        Sin resultados para “{search}”.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPending.map((p) => {
                      const disabled = rowOtherDebtor(p);
                      return (
                        <TableRow
                          key={p.orderId}
                          className={
                            disabled ? 'opacity-50' : 'hover:bg-muted/30 cursor-pointer'
                          }
                          title={
                            disabled ? 'Otro deudor o modo de cobro' : undefined
                          }
                          onClick={() => !disabled && toggleSelect(p.orderId)}
                        >
                          <TableCell className="py-3 px-4">
                            <Checkbox
                              checked={selected.has(p.orderId)}
                              disabled={disabled}
                              onCheckedChange={() => toggleSelect(p.orderId)}
                              aria-label="Seleccionar orden"
                            />
                          </TableCell>
                          <TableCell className="py-3 px-4 font-mono text-sm font-semibold">
                            {p.orderNumber}
                          </TableCell>
                          <TableCell className="py-3 px-4 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={
                                  p.debtorType === 'holder'
                                    ? 'bg-brand-cyan-soft text-brand-blue-strong border-brand-cyan/40'
                                    : 'bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30'
                                }
                              >
                                {p.debtorType === 'holder' ? 'Titular' : 'Seguro'}
                              </Badge>
                              {p.useFixedRate ? (
                                <Badge
                                  variant="outline"
                                  className="bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30"
                                >
                                  Tasa fija
                                </Badge>
                              ) : null}
                              <span className="truncate">{pendingDebtorName(p)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4 text-sm font-mono">
                            {pendingTargetLabel(p)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
            <div className="text-[11px] text-muted-foreground font-mono">
              {selectedRows.length} orden(es) seleccionada(s)
            </div>
            {selectedRows.length > 0 && !sameDebtor ? (
              <Badge className="bg-warning text-white shrink-0">
                Hay órdenes de otro deudor o modo
              </Badge>
            ) : null}
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/accounts-receivable?tab=pending')}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onCreate} disabled={creating || !canCreate}>
            {creating ? 'Creando…' : 'Realizar cobro'}
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
  const [batch, setBatch] = useState<AccountsReceivableBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const { usdRates, currentRateId } = useUsdRates();
  const [selectedUsdRateId, setSelectedUsdRateId] = useState<string>('');
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});

  // Add-orders popover.
  const [candidates, setCandidates] = useState<PendingReceivable[]>([]);
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
      setBatch(await accountsReceivableGateway.getBatch(id));
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudo cargar el lote'));
      navigate('/accounts-receivable?tab=batches');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedUsdRateId && currentRateId) setSelectedUsdRateId(currentRateId);
  }, [currentRateId, selectedUsdRateId]);

  const fixed = batch?.mode === 'fixed';
  const debtorType = batch?.holderId ? 'holder' : 'insurance';
  const debtorId = batch?.holderId ?? batch?.insuranceId ?? null;
  const isCollected = batch?.status === 'collected';

  const loadCandidates = useCallback(async () => {
    if (!batch || !debtorId) return;
    try {
      const res = await accountsReceivableGateway.listPending({
        debtorType,
        [debtorType === 'insurance' ? 'insuranceId' : 'holderId']: debtorId,
        limit: 200,
        search: candidateSearch || undefined,
      });
      // Mismo modo (tasa fija vs USD).
      setCandidates(res.data.filter((c) => c.useFixedRate === fixed));
    } catch {
      setCandidates([]);
    }
  }, [batch, debtorId, debtorType, candidateSearch, fixed]);

  useEffect(() => {
    if (candidatesOpen) loadCandidates();
  }, [candidatesOpen, loadCandidates]);

  const selectedMarketRate = useMemo(
    () => usdRates.find((r) => r.id === selectedUsdRateId) ?? null,
    [usdRates, selectedUsdRateId],
  );

  // ---------------- Payment form ----------------
  const methods = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, reset } = methods;

  const handleSelectRate = (rid: string) => {
    setSelectedUsdRateId(rid);
    const current = methods.getValues('payments') ?? [];
    let dirty = false;
    const next = current.map((p) => {
      if (
        p.type === 'cash_bs' ||
        p.type === 'mobile_payment' ||
        p.type === 'bank_transfer' ||
        p.type === 'card'
      ) {
        if (p.exchangeRateId !== rid) {
          dirty = true;
          return { ...p, exchangeRateId: rid };
        }
      }
      return p;
    });
    if (dirty) methods.setValue('payments', next, { shouldDirty: true });
  };

  const lookupRate = useCallback(
    (rid: string): ExchangeRate | null =>
      eurRatesById[rid] ?? usdRates.find((r) => r.id === rid) ?? null,
    [eurRatesById, usdRates],
  );

  const watchedPayments = methods.watch('payments') ?? [];
  const totalPaymentsUsd = useMemo(
    () =>
      watchedPayments.reduce(
        (sum, p) => sum + paymentInUsd(p, selectedMarketRate, lookupRate),
        0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedPayments, selectedMarketRate, eurRatesById],
  );
  const totalPaymentsBs = useMemo(
    () =>
      watchedPayments.reduce(
        (sum, p) => sum + paymentInBs(p, selectedMarketRate, lookupRate),
        0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedPayments, selectedMarketRate, eurRatesById],
  );

  const unit = fixed ? 'Bs.' : 'USD';
  const target = fixed ? batch?.targetBs ?? 0 : batch?.targetUsd ?? 0;
  const collected = fixed ? batch?.collectedBs ?? 0 : batch?.collectedUsd ?? 0;
  const pendingVal = fixed ? batch?.pendingBs ?? 0 : batch?.pendingUsd ?? 0;
  const liveForm = fixed ? totalPaymentsBs : totalPaymentsUsd;
  const liveRemaining = pendingVal - liveForm;

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
        paymentAccountId: p.paymentAccountId || undefined,
        amountCurrency: p.amountCurrency,
        amountValue: p.amountValue,
      }));
      let updated: AccountsReceivableBatch;
      if (editingPaymentId) {
        updated = await accountsReceivableGateway.editPayment(
          id,
          editingPaymentId,
          payments[0],
        );
        notify.success('Cobro actualizado');
      } else {
        updated = await accountsReceivableGateway.registerCollection(id, payments);
        notify.success('Cobro registrado');
      }
      setBatch(updated);
      reset({ payments: [] });
      setEditingPaymentId(null);
    } catch (e) {
      notify.fromError(e, 'No se pudo registrar el cobro');
    } finally {
      setBusy(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);
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
          paymentAccountId: p.paymentAccountId ?? '',
          amountCurrency: p.amountCurrency,
          amountValue: Number(p.amountValue) || 0,
        } as OrderPaymentValues,
      ],
    });
    document.getElementById('ar-payment-form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const cancelEdit = () => {
    setEditingPaymentId(null);
    reset({ payments: [] });
  };

  const onDeletePayment = async (paymentId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsReceivableGateway.deletePayment(id, paymentId));
      notify.success('Cobro eliminado');
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el cobro');
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
      setBatch(await accountsReceivableGateway.addOrders(id, ids));
      notify.success('Órdenes agregadas');
      setCandidateSel(new Set());
      setCandidatesOpen(false);
    } catch (e) {
      notify.fromError(e, 'No se pudieron agregar las órdenes');
    } finally {
      setBusy(false);
    }
  };

  const onRemoveOrder = async (orderId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsReceivableGateway.removeOrders(id, [orderId]));
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
      await accountsReceivableGateway.deleteBatch(id);
      notify.success('Lote anulado');
      navigate('/accounts-receivable?tab=batches');
    } catch (e) {
      notify.fromError(e, 'No se pudo anular el lote');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const existingOrderIds = useMemo(
    () => new Set((batch?.orders ?? []).map((o) => o.orderId)),
    [batch],
  );
  const eligibleCandidates = candidates.filter(
    (c) => !existingOrderIds.has(c.orderId),
  );

  if (loading || !batch) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
        Cargando lote…
      </div>
    );
  }

  const usdRate = fixed ? null : selectedMarketRate;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Lote de cobro N° {batch.receivableNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {debtorDisplayName(batch)} ·{' '}
            {debtorType === 'holder' ? 'Titular' : 'Seguro'}
            {fixed ? ' · tasa fija' : ''} · {STATUS_TEXT[batch.status]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/accounts-receivable?tab=batches')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
      </div>

      <FormSection
        title="Resumen"
        description={
          fixed
            ? 'Modo tasa fija — los cobros se comparan en bolívares.'
            : 'Sin tope — el deudor puede pagar por encima del agregado.'
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <SummaryTile label="Total a cobrar" value={`${formatMoney(target)} ${unit}`} />
          <SummaryTile
            label="Total cobrado"
            value={`${formatMoney(collected)} ${unit}`}
            tone="success"
          />
          <SummaryTile
            label="Falta por cobrar"
            value={`${pendingVal < 0 ? '+' : ''}${formatMoney(Math.abs(pendingVal))} ${unit}`}
          />
        </div>
      </FormSection>

      {/* Órdenes */}
      <FormSection
        title={`Órdenes del lote (${batch.orders?.length ?? 0})`}
        description="Órdenes del deudor incluidas en este lote."
      >
        {!isCollected ? (
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
                      placeholder="Buscar por N° orden…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {eligibleCandidates.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                      Sin órdenes pendientes para este deudor y modo.
                    </p>
                  ) : (
                    eligibleCandidates.map((c) => (
                      <label
                        key={c.orderId}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={candidateSel.has(c.orderId)}
                          onCheckedChange={() =>
                            setCandidateSel((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.orderId)) next.delete(c.orderId);
                              else next.add(c.orderId);
                              return next;
                            })
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-semibold">
                            N° {c.orderNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {c.useFixedRate && c.targetBs !== null
                              ? `${formatMoney(c.targetBs)} Bs.`
                              : `${formatMoney(c.targetUsd ?? 0)} USD`}
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
        ) : null}

        <ul className="text-sm divide-y">
          {(batch.orders ?? []).map((o) => (
            <li
              key={o.orderId}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3"
            >
              <span className="font-mono font-medium">
                N° {o.order?.orderNumber ?? '—'}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono">
                  {o.useFixedRate && o.targetBs != null
                    ? `${formatMoney(o.targetBs)} Bs.`
                    : `${formatMoney(o.targetUsd ?? 0)} USD`}
                </span>
                {!isCollected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveOrder(o.orderId)}
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

      {/* Cobros registrados */}
      <FormSection
        title={`Cobros registrados (${batch.payments?.length ?? 0})`}
        description="Cobros aplicados a este lote."
      >
        {(batch.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sin cobros registrados.</p>
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
                    {formatMoney(p.amountInUsd)} USD
                    {p.referenceNumber ? ` · Ref. ${p.referenceNumber}` : ''}
                  </div>
                </div>
                <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.UPDATE}>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEditPayment(p.id)}
                      disabled={busy}
                      title="Editar cobro"
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
                      title="Eliminar cobro"
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

      {/* Registrar / editar cobro */}
      <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.UPDATE}>
        <div id="ar-payment-form">
          <FormProvider {...methods}>
            <form
              onSubmit={handleSubmit(onSubmitPayment, (errs) => notifyFormErrors(errs))}
            >
              <FormSection
                title={editingPaymentId ? 'Editar cobro' : 'Registrar cobro'}
                description="Mismo componente de pagos usado al crear órdenes."
              >
                <Controller
                  control={control}
                  name="payments"
                  render={({ field }) => (
                    <OrderPaymentForm
                      payments={(field.value ?? []) as OrderPaymentValues[]}
                      onChange={(next) => field.onChange(next)}
                      usdRate={usdRate ?? selectedMarketRate}
                      onEurRateLoaded={(r) =>
                        setEurRatesById((prev) =>
                          prev[r.id] ? prev : { ...prev, [r.id]: r },
                        )
                      }
                      errors={buildPaymentErrors(
                        (formState.errors as { payments?: unknown }).payments,
                      )}
                      allowedTypes={INCOMING_PAYMENT_TYPES}
                    />
                  )}
                />

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-2 bg-muted/30">
                    <div className="text-xs text-muted-foreground">
                      Total de los cobros cargados ({fixed ? 'Bs.' : 'USD'})
                    </div>
                    <div className="font-mono">
                      {fixed
                        ? `${formatMoney(totalPaymentsBs)} Bs.`
                        : `${formatMoney(totalPaymentsUsd)} USD`}
                    </div>
                  </div>
                  <UsdRateSelect
                    rates={usdRates}
                    selectedId={selectedUsdRateId}
                    currentRateId={currentRateId}
                    onSelect={handleSelectRate}
                    lockNote={
                      fixed
                        ? 'Tasa para convertir cobros en USD/EUR a Bs (referencia).'
                        : undefined
                    }
                  />
                </div>

                <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Cobrado {formatMoney(collected)} / objetivo {formatMoney(target)}{' '}
                    {unit}
                  </div>
                  {Math.abs(liveRemaining) <= 0.01 ? (
                    <Badge className="bg-success text-white shrink-0">Cuadrado</Badge>
                  ) : liveRemaining < 0 ? (
                    <Badge className="bg-brand-blue text-white shrink-0">
                      Excede {formatMoney(Math.abs(liveRemaining))} {unit}
                    </Badge>
                  ) : (
                    <Badge className="bg-warning text-white shrink-0">
                      Falta {formatMoney(liveRemaining)} {unit}
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
                      (!fixed && !selectedMarketRate)
                    }
                  >
                    {busy || formState.isSubmitting
                      ? 'Guardando…'
                      : editingPaymentId
                        ? 'Guardar cambios'
                        : 'Registrar cobro'}
                  </Button>
                </div>
              </FormSection>
            </form>
          </FormProvider>
        </div>
      </Can>

      {/* Anular lote */}
      <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.SOFT_DELETE}>
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
                <AlertDialogTitle>
                  Anular lote N° {batch.receivableNumber}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán sus cobros y las órdenes volverán a Pendientes.
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
                <AlertDialogTitle>Eliminar cobro</AlertDialogTitle>
                <AlertDialogDescription>
                  El cobro se eliminará y el saldo del lote se recalculará.
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

const STATUS_TEXT: Record<AccountsReceivableBatch['status'], string> = {
  collected: 'Cobrado',
  uncollected: 'No cobrado',
  partially_collected: 'Cobrado parcialmente',
  overcollected: 'Sobre-cobrado',
};

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div
      className={
        tone === 'success'
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
