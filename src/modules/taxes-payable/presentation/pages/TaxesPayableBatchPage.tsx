import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronDown,
  ChevronLeft,
  FileSpreadsheet,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
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
import { taxPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  type PaymentItemErrors,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import { taxesPayableGateway } from '../../infrastructure/taxesPayableGateway';
import {
  batchProvidersSummary,
  effectiveTaxAmountBs,
  recipientName,
  taxAmountBs,
  type TaxBatch,
  type TaxObligation,
} from '../../domain/models/taxesPayable';
import { downloadIslrComprobanteXlsx } from '../components/taxesPayableExcel';
import { TaxUnitSelect } from '@/modules/tax-units/presentation/components/TaxUnitSelect';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const paymentSchema = z.object({
  payments: z.array(taxPaymentSchema).min(1, 'Registra al menos un pago'),
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

// La retención se paga al SENIAT en Bs fijos → sólo métodos en Bs, sin tasa.
const STANDARD_TYPES: OrderPaymentType[] = ['mobile_payment', 'bank_transfer', 'cash_bs'];

type CreateState = {
  taxPayableIds: string[];
} | null;

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
            amountCurrency: e.amountCurrency?.message,
            amountValue: e.amountValue?.message,
          }
        : {},
  );
}

export function TaxesPayableBatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isCreate = !id;
  const createState = (location.state as CreateState) ?? null;

  // ---------------- Create mode ----------------
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<TaxObligation[]>([]);
  const [createLoading, setCreateLoading] = useState(isCreate);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(createState?.taxPayableIds ?? []),
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isCreate) return;
    let cancelled = false;
    (async () => {
      setCreateLoading(true);
      setCreateError(null);
      try {
        const res = await taxesPayableGateway.listPending({ limit: 200 });
        if (cancelled) return;
        setPending(res.data);
      } catch (e) {
        if (!cancelled)
          setCreateError(
            getHttpErrorMessage(e, 'No se pudieron cargar las retenciones pendientes'),
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
    () => pending.filter((t) => selected.has(t.id)),
    [pending, selected],
  );

  // Un lote SENIAT puede mezclar proveedores: el pago va al fisco, no al proveedor.
  const canCreate = selectedRows.length >= 1;

  // Resultados del buscador: sólo al escribir, excluye las ya agregadas.
  // Un lote SENIAT puede mezclar proveedores → sin restricción de proveedor.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pending.filter((t) => {
      if (selected.has(t.id)) return false;
      return (
        t.taxPayableNumber.toLowerCase().includes(q) ||
        recipientName(t).toLowerCase().includes(q) ||
        (t.internalNumbers ?? []).some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [pending, search, selected]);

  const toggleSelect = (taxId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taxId)) next.delete(taxId);
      else next.add(taxId);
      return next;
    });

  const selectedTotalBs = useMemo(
    () => selectedRows.reduce((s, t) => s + taxAmountBs(t), 0),
    [selectedRows],
  );

  const ordersLabel = (t: TaxObligation): string => {
    const list = t.internalNumbers ?? [];
    if (list.length === 0) return '—';
    if (list.length <= 2) return list.join(', ');
    return `${list[0]}, ${list[1]} +${list.length - 2}`;
  };

  const onCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const batch = await taxesPayableGateway.createBatch({
        taxPayableIds: selectedRows.map((r) => r.id),
      });
      notify.success('Lote creado');
      navigate(`/taxes-payable/${batch.id}`, { replace: true });
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
              Pagar retenciones
            </h1>
            <p className="text-sm text-muted-foreground">
              Selecciona las retenciones pendientes a incluir en el lote. Pueden
              ser de varios proveedores.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/taxes-payable?tab=pending')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver
          </button>
        </div>

        <FormSection
          title="Retenciones del lote"
          description="Estas retenciones forman el lote. Busca para agregar más; pueden ser de proveedores distintos."
        >
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por N° comprobante, orden o proveedor…"
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
            <p className="text-sm text-muted-foreground">Cargando retenciones…</p>
          ) : (
            <>
              {/* Resultados del buscador: agregar al lote */}
              {search.trim() ? (
                <div className="mb-4 rounded-lg border divide-y overflow-hidden">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Sin resultados para “{search}”.
                    </p>
                  ) : (
                    candidates.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleSelect(t.id)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold">
                            {t.taxPayableNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {recipientName(t)} ·{' '}
                            {t.recipientType === 'doctor' ? 'Doctor' : 'Centro'} ·{' '}
                            {ordersLabel(t)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm">
                            {formatMoney(taxAmountBs(t))} Bs.
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
                  No hay retenciones en el lote. Busca y agrega al menos una.
                </p>
              ) : (
                <ul className="text-sm divide-y rounded-lg border">
                  {selectedRows.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold">
                          {t.taxPayableNumber}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {recipientName(t)} ·{' '}
                          {t.recipientType === 'doctor' ? 'Doctor' : 'Centro'} ·{' '}
                          {ordersLabel(t)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono">
                          {formatMoney(taxAmountBs(t))} Bs.
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => toggleSelect(t.id)}
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
              {selectedRows.length} retención(es) · {formatMoney(selectedTotalBs)} Bs.
            </div>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/taxes-payable?tab=pending')}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onCreate} disabled={creating || !canCreate}>
            {creating ? 'Creando…' : 'Pagar retenciones'}
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
  const [batch, setBatch] = useState<TaxBatch | null>(null);
  const [loading, setLoading] = useState(true);

  const [candidates, setCandidates] = useState<TaxObligation[]>([]);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSel, setCandidateSel] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPaymentDelete, setConfirmPaymentDelete] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Datos del comprobante ISLR (los pide el usuario al descargar).
  const [comprobanteNumber, setComprobanteNumber] = useState('');
  const [comprobanteDate, setComprobanteDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await taxesPayableGateway.getBatch(id);
      setBatch(b);
      // Prefill con los datos del comprobante guardados en el lote.
      setComprobanteNumber(b.comprobanteNumber ?? '');
      if (b.comprobanteIssueDate) {
        setComprobanteDate(b.comprobanteIssueDate.slice(0, 10));
      }
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudo cargar el lote'));
      navigate('/taxes-payable?tab=batches');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  const isPaid = batch?.status === 'paid';

  const loadCandidates = useCallback(async () => {
    if (!batch) return;
    try {
      // Un lote SENIAT puede mezclar proveedores → candidatos = todas las pendientes.
      const res = await taxesPayableGateway.listPending({
        limit: 200,
        search: candidateSearch || undefined,
      });
      setCandidates(res.data);
    } catch {
      setCandidates([]);
    }
  }, [batch, candidateSearch]);

  useEffect(() => {
    if (candidatesOpen) loadCandidates();
  }, [candidatesOpen, loadCandidates]);

  // ---------------- Payment form ----------------
  const methods = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, setValue, getValues, reset } = methods;
  const todayIso = new Date().toISOString().slice(0, 10);

  const paymentDefaults = (type: OrderPaymentType): OrderPaymentValues => ({
    type,
    paymentDate: todayIso,
    referenceNumber: '',
    bankCode: '',
    exchangeRateId: '',
    accountNumber: '',
    amountValue: 0,
    amountCurrency: 'BS',
  });

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

  const watchedPayments = methods.watch('payments') ?? [];
  // Todos los pagos son Bs fijos → suma directa.
  const totalPaymentsBs = useMemo(
    () => watchedPayments.reduce((sum, p) => sum + Number(p.amountValue || 0), 0),
    [watchedPayments],
  );

  const targetBs = batch?.targetBs ?? 0;
  const priorPaidBs = batch?.paidBs ?? 0;
  const pendingBs = batch?.pendingBs ?? 0;
  const cumulativeBs = Math.round((priorPaidBs + totalPaymentsBs) * 100) / 100;
  const liveRemaining = targetBs - cumulativeBs;
  const isOver = cumulativeBs - targetBs > 0.01;
  const isComplete = targetBs > 0 && Math.abs(liveRemaining) <= 0.01;
  const canRegister = !isPaid && totalPaymentsBs > 0.01 && !isOver;

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
      let updated: TaxBatch;
      if (editingPaymentId) {
        updated = await taxesPayableGateway.editPayment(id, editingPaymentId, payments[0]);
        notify.success('Pago actualizado');
      } else {
        updated = await taxesPayableGateway.registerPayment(id, payments);
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
          exchangeRateId: '',
          amountCurrency: 'BS',
          amountValue: Number(p.amountValue) || 0,
        } as OrderPaymentValues,
      ],
    });
    document.getElementById('tax-payment-form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const cancelEdit = () => {
    setEditingPaymentId(null);
    reset({ payments: [] });
  };

  const onDeletePayment = async (paymentId: string) => {
    setBusy(true);
    try {
      setBatch(await taxesPayableGateway.deletePayment(id, paymentId));
      notify.success('Pago eliminado');
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el pago');
    } finally {
      setBusy(false);
      setConfirmPaymentDelete(null);
    }
  };

  const onAddObligations = async () => {
    const ids = [...candidateSel];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      setBatch(await taxesPayableGateway.addObligations(id, ids));
      notify.success('Retenciones agregadas');
      setCandidateSel(new Set());
      setCandidatesOpen(false);
    } catch (e) {
      notify.fromError(e, 'No se pudieron agregar las retenciones');
    } finally {
      setBusy(false);
    }
  };

  const onRemoveObligation = async (taxPayableId: string) => {
    setBusy(true);
    try {
      setBatch(await taxesPayableGateway.removeObligations(id, [taxPayableId]));
      notify.success('Retención quitada');
    } catch (e) {
      notify.fromError(e, 'No se pudo quitar la retención');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteBatch = async () => {
    setBusy(true);
    try {
      await taxesPayableGateway.deleteBatch(id);
      notify.success('Lote anulado');
      navigate('/taxes-payable?tab=batches');
    } catch (e) {
      notify.fromError(e, 'No se pudo anular el lote');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const onSaveComprobante = async () => {
    if (!comprobanteNumber.trim() || !comprobanteDate) return;
    setBusy(true);
    try {
      setBatch(
        await taxesPayableGateway.setComprobante(id, {
          comprobanteNumber: comprobanteNumber.trim(),
          issueDate: comprobanteDate,
        }),
      );
      notify.success('Datos del comprobante guardados');
    } catch (e) {
      notify.fromError(e, 'No se pudieron guardar los datos');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadComprobante = async () => {
    if (!batch || !comprobanteNumber.trim() || !comprobanteDate) return;
    setDownloading(true);
    try {
      await downloadIslrComprobanteXlsx(batch, {
        comprobanteNumber: comprobanteNumber.trim(),
        issueDate: comprobanteDate,
      });
    } catch (e) {
      notify.error(getHttpErrorMessage(e, 'No se pudo generar el comprobante'));
    } finally {
      setDownloading(false);
    }
  };

  const onSetAdjustment = async (taxUnitId: string | null) => {
    setBusy(true);
    try {
      setBatch(await taxesPayableGateway.setAdjustment(id, taxUnitId));
      notify.success(taxUnitId ? 'Ajuste aplicado' : 'Ajuste quitado');
    } catch (e) {
      notify.fromError(e, 'No se pudo aplicar el ajuste');
    } finally {
      setBusy(false);
    }
  };

  const existingIds = useMemo(
    () => new Set((batch?.obligations ?? []).map((o) => o.id)),
    [batch],
  );
  const eligibleCandidates = candidates.filter((c) => !existingIds.has(c.id));

  if (loading || !batch) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
        Cargando lote…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Lote de pago al SENIAT N° {batch.taxBatchNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {batchProvidersSummary(batch)} · {STATUS_TEXT[batch.status]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/taxes-payable?tab=batches')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
      </div>

      <FormSection title="Resumen" description="Retención total a pagar al SENIAT en Bs.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <SummaryTile label="Total al SENIAT" value={`${formatMoney(targetBs)} Bs.`} />
          <SummaryTile
            label="Total pagado"
            value={`${formatMoney(priorPaidBs)} Bs.`}
            tone="success"
          />
          <SummaryTile label="Falta por pagar" value={`${formatMoney(pendingBs)} Bs.`} />
        </div>
        {batch.adjustmentTaxUnit ? (
          <p className="text-xs text-muted-foreground mt-2">
            Total con ajuste de UT (1 UT = {formatMoney(batch.adjustmentTaxUnit.amountBs)}{' '}
            Bs.). Sin ajuste: {formatMoney(batch.originalTargetBs ?? 0)} Bs.
          </p>
        ) : null}
      </FormSection>

      {/* Retenciones */}
      <FormSection
        title={`Retenciones del lote (${batch.obligations?.length ?? 0})`}
        description="Comprobantes de retención incluidos en este lote."
      >
        {!isPaid ? (
          <div className="flex justify-end mb-2">
            <Popover open={candidatesOpen} onOpenChange={setCandidatesOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={busy}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar retenciones
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
                      placeholder="Buscar por N° comprobante u orden…"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {eligibleCandidates.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                      Sin retenciones pendientes.
                    </p>
                  ) : (
                    eligibleCandidates.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={candidateSel.has(c.id)}
                          onCheckedChange={() =>
                            setCandidateSel((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-semibold">
                            {c.taxPayableNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {recipientName(c)} · {formatMoney(taxAmountBs(c))} Bs.
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
                    onClick={onAddObligations}
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
            El lote está pagado: edita o quita un pago para modificar sus retenciones.
          </p>
        )}

        <ul className="text-sm divide-y">
          {(batch.obligations ?? []).map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3"
            >
              <div className="min-w-0">
                <div className="font-mono font-medium">{o.taxPayableNumber}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {recipientName(o)}
                  {(o.internalNumbers ?? []).length > 0
                    ? ` · Órdenes: ${(o.internalNumbers ?? []).join(', ')}`
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono">
                  {formatMoney(effectiveTaxAmountBs(o))} Bs.
                  {o.adjustedTaxAmountBs !== undefined &&
                  Math.abs(effectiveTaxAmountBs(o) - taxAmountBs(o)) > 0.009 ? (
                    <span className="ml-1.5 text-[11px] text-muted-foreground line-through">
                      {formatMoney(taxAmountBs(o))}
                    </span>
                  ) : null}
                </span>
                {!isPaid ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveObligation(o.id)}
                    title="Quitar"
                    disabled={busy || (batch.obligations?.length ?? 0) <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </FormSection>

      {/* Comprobante de retención ISLR */}
      <FormSection
        title="Comprobante de retención ISLR"
        description="Documento general del lote (Decreto 1.808): una hoja por sujeto retenido, con una fila por factura. Completa los datos para descargarlo."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]">
          <div className="space-y-1.5">
            <label
              htmlFor="comprobante-number"
              className="text-sm font-medium leading-none"
            >
              N° de comprobante <span className="text-destructive">*</span>
            </label>
            <Input
              id="comprobante-number"
              placeholder="Ej. 20260600000079"
              value={comprobanteNumber}
              onChange={(e) => setComprobanteNumber(e.target.value)}
              className="h-9 font-mono"
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">
              Correlativo SENIAT del comprobante (año + mes + secuencia).
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="comprobante-date"
              className="text-sm font-medium leading-none"
            >
              Fecha de emisión <span className="text-destructive">*</span>
            </label>
            <Input
              id="comprobante-date"
              type="date"
              value={comprobanteDate}
              onChange={(e) => setComprobanteDate(e.target.value)}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              Define también el período fiscal (año/mes) del comprobante.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Can permission={PERMISSIONS.TAXES_PAYABLE.UPDATE}>
            <Button
              type="button"
              variant="outline"
              onClick={onSaveComprobante}
              disabled={busy || !comprobanteNumber.trim() || !comprobanteDate}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {busy ? 'Guardando…' : 'Guardar datos'}
            </Button>
          </Can>
          <Button
            type="button"
            onClick={handleDownloadComprobante}
            disabled={downloading || !comprobanteNumber.trim() || !comprobanteDate}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            {downloading ? 'Generando…' : 'Descargar comprobante (Excel)'}
          </Button>
        </div>
      </FormSection>

      {/* Ajuste de UT */}
      <Can permission={PERMISSIONS.TAXES_PAYABLE.UPDATE}>
        <FormSection
          title="Ajuste"
          description="Si la Unidad Tributaria subió entre pagar la cuenta por pagar y enterar la retención, selecciona la UT nueva: el monto a pagar al SENIAT se recalcula (lo retenido al proveedor no cambia)."
        >
          <div className="flex items-end gap-2 flex-wrap">
            <TaxUnitSelect
              className="flex-1 min-w-64"
              label="Unidad Tributaria del ajuste"
              placeholder="Sin ajuste — se paga el monto original de cada retención"
              selectedId={batch.adjustmentTaxUnitId ?? null}
              selectedFallback={batch.adjustmentTaxUnit ?? null}
              onSelect={(ut) => onSetAdjustment(ut.id)}
              disabled={isPaid || busy}
              lockNote={
                isPaid
                  ? 'El lote está pagado: edita o quita un pago para ajustar la UT.'
                  : undefined
              }
            />
            {batch.adjustmentTaxUnitId && !isPaid ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => onSetAdjustment(null)}
                disabled={busy}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Quitar ajuste
              </Button>
            ) : null}
          </div>
          {batch.adjustmentTaxUnit ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
              <SummaryTile
                label="Total sin ajuste"
                value={`${formatMoney(batch.originalTargetBs ?? 0)} Bs.`}
              />
              <SummaryTile
                label="Total ajustado al SENIAT"
                value={`${formatMoney(targetBs)} Bs.`}
                tone="success"
              />
            </div>
          ) : null}
        </FormSection>
      </Can>

      {/* Pagos registrados */}
      <FormSection
        title={`Pagos al SENIAT registrados (${batch.payments?.length ?? 0})`}
        description="Pagos aplicados al total del lote."
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
                    {formatMoney(p.amountInBs)} Bs.
                    {p.referenceNumber ? ` · Ref. ${p.referenceNumber}` : ''}
                  </div>
                </div>
                <Can permission={PERMISSIONS.TAXES_PAYABLE.UPDATE}>
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
      <Can permission={PERMISSIONS.TAXES_PAYABLE.UPDATE}>
        <div id="tax-payment-form">
          <FormProvider {...methods}>
            <form
              onSubmit={handleSubmit(onSubmitPayment, (errs) => notifyFormErrors(errs))}
            >
              <FormSection
                title={editingPaymentId ? 'Editar pago al SENIAT' : 'Registrar pago al SENIAT'}
                description="El impuesto se paga en bolívares fijos. Puedes pagar parcial."
              >
                <Controller
                  control={control}
                  name="payments"
                  render={({ field }) => (
                    <OrderPaymentForm
                      payments={(field.value ?? []) as OrderPaymentValues[]}
                      onChange={(next) => field.onChange(next)}
                      usdRate={null}
                      errors={buildPaymentErrors(
                        (formState.errors as { payments?: unknown }).payments,
                      )}
                      hideAddButtons
                      onRemovePayment={removePaymentAt}
                      usePaymentAccount={false}
                      allowedTypes={STANDARD_TYPES}
                      hideExchangeRate
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

                <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Acumulado {formatMoney(cumulativeBs)} / total {formatMoney(targetBs)}{' '}
                    Bs. · ya pagado {formatMoney(priorPaidBs)} Bs.
                  </div>
                  {isComplete ? (
                    <Badge className="bg-success text-white shrink-0">Cuadrado</Badge>
                  ) : isOver ? (
                    <Badge className="bg-destructive text-white shrink-0">
                      Excede {formatMoney(cumulativeBs - targetBs)} Bs.
                    </Badge>
                  ) : totalPaymentsBs > 0.01 ? (
                    <Badge className="bg-brand-blue text-white shrink-0">
                      Parcial · falta {formatMoney(targetBs - cumulativeBs)} Bs.
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
              </FormSection>
            </form>
          </FormProvider>
        </div>
      </Can>

      {/* Anular lote */}
      <Can permission={PERMISSIONS.TAXES_PAYABLE.SOFT_DELETE}>
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
                  Anular lote N° {batch.taxBatchNumber}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán sus pagos y las retenciones volverán a Pendientes.
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

const STATUS_TEXT: Record<TaxBatch['status'], string> = {
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
