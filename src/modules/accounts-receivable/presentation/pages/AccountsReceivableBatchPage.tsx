import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronDown,
  ChevronLeft,
  Download,
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
import { formatBs, formatMoney } from '@/lib/format/money';
import { formatDateOnly } from '@/lib/dates';
import { PageLoader } from '@/components/ui/spinner';
import { casheaBreakdownCents } from '@/lib/money/cashea';
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
import { downloadEstadoCuentaSeguro } from '../components/arExcel';
import {
  debtorDisplayName,
  DEBTOR_TYPE_LABEL,
  pendingBatchKey,
  pendingDebtorId,
  pendingDebtorName,
  pendingDebtorTypeLabel,
  pendingRowKey,
  portionLabel,
  type AccountsReceivableBatch,
  type AccountsReceivableDebtorType,
  type PendingReceivable,
} from '../../domain/models/accountsReceivable';
import {
  PAYMENT_TYPE_LABEL,
  orderUserDisplayName,
} from '@/modules/orders/domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const paymentSchema = z.object({
  payments: z.array(orderPaymentSchema).min(1, 'Registra al menos un cobro'),
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

type CreateState = {
  debtorType: AccountsReceivableDebtorType;
  /** null para cashea (el deudor es la fintech, sin id). */
  debtorId: string | null;
  debtorName: string;
  useFixedRate?: boolean;
  /** Claves de fila pendiente (`orderId:portion`) preseleccionadas en la lista. */
  pendingKeys: string[];
} | null;

type CreateDebtor = {
  debtorType: AccountsReceivableDebtorType;
  debtorId: string | null;
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
    () => new Set(createState?.pendingKeys ?? []),
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
        // Con deudor fijado (vino de la lista), traemos sólo sus pendientes:
        // el buscador queda restringido a ese mismo deudor.
        const res = await accountsReceivableGateway.listPending({
          limit: 200,
          ...(lockedDebtor
            ? {
                debtorType: lockedDebtor.debtorType,
                // Cashea no filtra por id: cualquier orden cashea es candidata.
                ...(lockedDebtor.debtorType === 'insurance' && lockedDebtor.debtorId
                  ? { insuranceId: lockedDebtor.debtorId }
                  : lockedDebtor.debtorType === 'holder' && lockedDebtor.debtorId
                    ? { holderId: lockedDebtor.debtorId }
                    : {}),
              }
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
  }, [isCreate, lockedDebtor]);

  // Claves por fila (orden + porción): una orden mixta aparece dos veces.
  const selectedRows = useMemo(
    () => pending.filter((p) => selected.has(pendingRowKey(p))),
    [pending, selected],
  );

  // Deudor + modo derivado: fijado por router state o por la primera fila marcada.
  const activeDebtor = useMemo<CreateDebtor | null>(() => {
    if (lockedDebtor) return lockedDebtor;
    if (selectedRows.length === 0) return null;
    const first = selectedRows[0];
    return {
      debtorType: first.debtorType,
      debtorId: pendingDebtorId(first),
      debtorName:
        first.debtorType === 'cashea' ? 'Cashea' : pendingDebtorName(first),
      useFixedRate: first.useFixedRate,
    };
  }, [lockedDebtor, selectedRows]);

  // Misma clave deudor + modo (tasa fija vs USD). Cashea agrupa sin id.
  const debtorKey = activeDebtor
    ? `${activeDebtor.debtorType}:${activeDebtor.debtorType === 'cashea' ? '' : activeDebtor.debtorId ?? ''}:${activeDebtor.useFixedRate}`
    : null;

  const sameDebtor = useMemo(
    () => selectedRows.every((r) => pendingBatchKey(r) === debtorKey),
    [selectedRows, debtorKey],
  );

  const canCreate = selectedRows.length >= 1 && !!activeDebtor && sameDebtor;

  // Resultados del buscador: sólo al escribir, excluye las ya agregadas y
  // (con deudor activo) restringe al mismo deudor y modo de cobro.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pending.filter((p) => {
      if (selected.has(pendingRowKey(p))) return false;
      if (debtorKey && pendingBatchKey(p) !== debtorKey) return false;
      return (
        p.orderNumber.toLowerCase().includes(q) ||
        pendingDebtorName(p).toLowerCase().includes(q)
      );
    });
  }, [pending, search, selected, debtorKey]);

  const toggleSelect = (rowKey: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });

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
          activeDebtor.debtorType === 'insurance'
            ? activeDebtor.debtorId ?? undefined
            : undefined,
        holderId:
          activeDebtor.debtorType === 'holder'
            ? activeDebtor.debtorId ?? undefined
            : undefined,
        orderIds: selectedRows.map((r) => r.orderId),
        // Resuelve qué porción de una orden mixta entra al lote.
        mode: activeDebtor.useFixedRate ? 'fixed' : 'usd',
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
                    DEBTOR_TYPE_LABEL[activeDebtor.debtorType]
                  }${activeDebtor.useFixedRate ? ' · tasa fija' : ''}`
                : 'Selecciona las órdenes pendientes de un mismo deudor y modo de cobro.'}
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
          title="Órdenes del lote"
          description="Estas órdenes forman el lote. Busca para agregar más del mismo deudor y modo (tasa fija o USD)."
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
          ) : (
            <>
              {/* Resultados del buscador: agregar al lote */}
              {search.trim() ? (
                <div className="mb-4 rounded-lg border divide-y overflow-hidden">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {activeDebtor
                        ? `Sin órdenes pendientes de este deudor y modo para “${search}”.`
                        : `Sin resultados para “${search}”.`}
                    </p>
                  ) : (
                    candidates.map((p) => (
                      <button
                        type="button"
                        key={pendingRowKey(p)}
                        onClick={() => toggleSelect(pendingRowKey(p))}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold">
                            N° {p.orderNumber}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                            <span className="truncate">{pendingDebtorName(p)}</span>
                            {p.useFixedRate ? (
                              <Badge
                                variant="outline"
                                className="bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30 text-[10px]"
                              >
                                Tasa fija
                              </Badge>
                            ) : null}
                            {portionLabel(p.portion) ? (
                              <Badge
                                variant="outline"
                                className="bg-brand-cyan-soft text-brand-cyan-strong border-brand-cyan/40 text-[10px]"
                              >
                                {portionLabel(p.portion)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm">
                            {pendingTargetLabel(p)}
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
                      key={pendingRowKey(p)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold">N° {p.orderNumber}</div>
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                          <Badge
                            variant="outline"
                            className={
                              p.debtorType === 'holder'
                                ? 'bg-brand-cyan-soft text-brand-blue-strong border-brand-cyan/40 text-[10px]'
                                : p.debtorType === 'cashea'
                                  ? 'bg-warning-soft text-warning border-warning/40 text-[10px]'
                                  : 'bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30 text-[10px]'
                            }
                          >
                            {pendingDebtorTypeLabel(p)}
                          </Badge>
                          {p.useFixedRate ? (
                            <Badge
                              variant="outline"
                              className="bg-brand-blue-soft text-brand-blue-strong border-brand-blue/30 text-[10px]"
                            >
                              Tasa fija
                            </Badge>
                          ) : null}
                          {portionLabel(p.portion) ? (
                            <Badge
                              variant="outline"
                              className="bg-brand-cyan-soft text-brand-cyan-strong border-brand-cyan/40 text-[10px]"
                            >
                              {portionLabel(p.portion)}
                            </Badge>
                          ) : null}
                          <span className="truncate">{pendingDebtorName(p)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono">{pendingTargetLabel(p)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => toggleSelect(pendingRowKey(p))}
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
              {selectedRows.length} orden(es) seleccionada(s)
            </div>
            {selectedRows.length > 0 && !sameDebtor ? (
              <Badge className="bg-warning text-white shrink-0">
                Hay órdenes de otro deudor o modo (sólo Cashea mezcla titulares)
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

  // Ajuste del total a cobrar (resta o suma). Espeja el ajuste de monto del
  // Paso 1: signo + monto + motivo obligatorio, con autor y fecha.
  const [adjSign, setAdjSign] = useState<'minus' | 'plus'>('minus');
  const [adjAmount, setAdjAmount] = useState<string>('');
  const [adjNote, setAdjNote] = useState<string>('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

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
  const debtorType: AccountsReceivableDebtorType = batch?.holderId
    ? 'holder'
    : batch?.insuranceId
      ? 'insurance'
      : 'cashea';
  const debtorId = batch?.holderId ?? batch?.insuranceId ?? null;
  const isCollected = batch?.status === 'collected';
  // Seguro indexado (isIndexed=false, modo USD): la tasa se escoge en la card
  // Resumen (alimenta el estado de cuenta y la conversión de los cobros). No
  // indexado usa la tasa fija de cada orden; crédito/cashea escogen la tasa en
  // "Registrar cobro".
  const rateInSummary = debtorType === 'insurance' && !fixed;
  const [downloadingStatement, setDownloadingStatement] = useState(false);

  const loadCandidates = useCallback(async () => {
    if (!batch) return;
    if (debtorType !== 'cashea' && !debtorId) return;
    try {
      const res = await accountsReceivableGateway.listPending({
        debtorType,
        // Cashea: cualquier orden cashea pendiente es candidata (sin id).
        ...(debtorType === 'insurance'
          ? { insuranceId: debtorId as string }
          : debtorType === 'holder'
            ? { holderId: debtorId as string }
            : {}),
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

  // Seguro no indexado: la tasa de los cobros es la tasa fija de la orden — no se
  // elige. Con varias tasas fijas en el lote manda la de la primera orden que
  // tenga una (mismo criterio del BE al convertir).
  const fixedRate = useMemo<ExchangeRate | null>(() => {
    if (!fixed) return null;
    const raw = (batch?.orders ?? []).find((o) => o.order?.fixedExchangeRate)
      ?.order?.fixedExchangeRate;
    if (!raw) return null;
    return (
      usdRates.find((r) => r.id === raw.id) ?? {
        id: raw.id,
        currency: 'USD',
        amountBs: String(raw.amountBs),
        effectiveDate: '',
        isActive: true,
      }
    );
  }, [fixed, batch, usdRates]);

  const selectedMarketRate = useMemo(
    () => fixedRate ?? usdRates.find((r) => r.id === selectedUsdRateId) ?? null,
    [fixedRate, usdRates, selectedUsdRateId],
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

  // Ajuste guardado del lote (en la moneda del lote).
  const savedAdjustment = Number(batch?.adjustmentAmount ?? 0) || 0;
  // Hidrata el formulario del ajuste con lo guardado (al cargar y tras guardar).
  useEffect(() => {
    const amount = Number(batch?.adjustmentAmount ?? 0) || 0;
    setAdjSign(amount > 0 ? 'plus' : 'minus');
    setAdjAmount(amount ? String(Math.abs(amount)) : '');
    setAdjNote(batch?.adjustmentNote ?? '');
  }, [batch?.id, batch?.adjustmentAmount, batch?.adjustmentNote]);

  const saveAdjustment = async (clear = false) => {
    const raw = Number((adjAmount || '0').replace(',', '.'));
    const value = clear || !Number.isFinite(raw) ? 0 : Math.abs(raw);
    const signed = adjSign === 'minus' ? -value : value;
    if (!clear && value > 0 && adjNote.trim().length < 3) {
      notify.error('Indica el motivo del ajuste (mínimo 3 caracteres).');
      return;
    }
    setSavingAdjustment(true);
    try {
      const updated = await accountsReceivableGateway.setAdjustment(
        id,
        clear ? 0 : signed,
        clear ? undefined : adjNote.trim(),
      );
      setBatch(updated);
      notify.success(clear ? 'Ajuste eliminado' : 'Ajuste guardado');
    } catch (e) {
      notify.fromError(e, 'No se pudo guardar el ajuste');
    } finally {
      setSavingAdjustment(false);
    }
  };

  // Desglose Cashea agregado del lote (sólo lotes cashea): suma el breakdown
  // exacto en centavos de cada orden con sus tasas snapshot (pueden diferir
  // entre órdenes). El neto agregado = "Total a cobrar" del lote.
  const casheaSummary = useMemo(() => {
    if (debtorType !== 'cashea' || !batch) return null;
    let totalCents = 0;
    let initialCents = 0;
    let remainingCents = 0;
    let commissionCents = 0;
    let financingCents = 0;
    let netCents = 0;
    for (const row of batch.orders ?? []) {
      const o = row.order;
      if (!o) continue;
      const total = Number(o.priceAmount ?? 0);
      const initial = Number(o.casheaFirstInstallmentAmount ?? 0);
      const b = casheaBreakdownCents(
        total,
        initial,
        Number(o.casheaCommissionRate ?? 0),
        Number(o.casheaFinancingRate ?? 0),
      );
      totalCents += Math.round(total * 100);
      initialCents += Math.round(initial * 100);
      remainingCents += b.remainingCents;
      commissionCents += b.commissionCents;
      financingCents += b.financingCents;
      netCents += b.netCents;
    }
    return {
      total: totalCents / 100,
      initial: initialCents / 100,
      remaining: remainingCents / 100,
      commission: commissionCents / 100,
      financing: financingCents / 100,
      net: netCents / 100,
    };
  }, [debtorType, batch]);
  const target = fixed ? batch?.targetBs ?? 0 : batch?.targetUsd ?? 0;
  const collected = fixed ? batch?.collectedBs ?? 0 : batch?.collectedUsd ?? 0;
  const pendingVal = fixed ? batch?.pendingBs ?? 0 : batch?.pendingUsd ?? 0;
  const liveForm = fixed ? totalPaymentsBs : totalPaymentsUsd;
  const liveRemaining = pendingVal - liveForm;

  // En modo USD las cifras del resumen están en USD; mostramos su equivalente
  // en Bs como referencia a la tasa seleccionada (la misma del form de cobro).
  // En modo tasa fija el valor ya está en Bs, no hace falta convertir.
  const rateBs = Number(selectedMarketRate?.amountBs ?? 0);
  const bsRef = (usd: number): string | undefined =>
    !fixed && rateBs > 0 ? `≈ ${formatBs(usd * rateBs)}` : undefined;

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

  const onDownloadStatement = async () => {
    if (!batch) return;
    setDownloadingStatement(true);
    try {
      await downloadEstadoCuentaSeguro(batch, fixed ? null : selectedMarketRate);
    } catch (e) {
      notify.fromError(e, 'No se pudo generar el estado de cuenta');
    } finally {
      setDownloadingStatement(false);
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
    return <PageLoader label="Cargando lote…" />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Lote de cobro N° {batch.receivableNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {debtorDisplayName(batch)} · {DEBTOR_TYPE_LABEL[debtorType]}
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
            : rateBs > 0
              ? 'Sin tope — el deudor puede pagar por encima del agregado. Bs de referencia a la tasa seleccionada.'
              : 'Sin tope — el deudor puede pagar por encima del agregado.'
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <SummaryTile
            label="Total a cobrar"
            value={`${formatMoney(target)} ${unit}`}
            sub={
              savedAdjustment
                ? `Base ${formatMoney(
                    fixed ? batch.targetBaseBs ?? 0 : batch.targetBaseUsd ?? 0,
                  )} ${unit} · ajuste ${savedAdjustment > 0 ? '+' : '−'}${formatMoney(
                    Math.abs(savedAdjustment),
                  )} ${unit}`
                : bsRef(target)
            }
          />
          <SummaryTile
            label="Total cobrado"
            value={`${formatMoney(collected)} ${unit}`}
            tone="success"
            sub={bsRef(collected)}
          />
          <SummaryTile
            label="Falta por cobrar"
            value={`${pendingVal < 0 ? '+' : ''}${formatMoney(Math.abs(pendingVal))} ${unit}`}
            sub={
              bsRef(Math.abs(pendingVal))
                ? `${pendingVal < 0 ? '+' : ''}${bsRef(Math.abs(pendingVal))}`
                : undefined
            }
          />
        </div>
        {casheaSummary ? (
          <>
            <div className="mt-3 rounded-lg border border-dashed bg-warning-soft/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Precio total órdenes
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(casheaSummary.total)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Inicial (Paso 1)
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(casheaSummary.initial)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  ya cobrada por el comercio, no entra al lote
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Restante
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(casheaSummary.remaining)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  total − inicial
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Comisión del Total
                </div>
                <div className="text-sm font-semibold text-destructive">
                  -{formatMoney(casheaSummary.commission)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  sobre el total de cada orden
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Comisión del Financiamiento
                </div>
                <div className="text-sm font-semibold text-destructive">
                  -{formatMoney(casheaSummary.financing)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  sobre el restante de cada orden
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Monto a recibir por Cashea
                </div>
                <div className="text-base font-bold text-success">
                  {formatMoney(casheaSummary.net)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  restante − comisión − financiamiento
                  {Math.abs(casheaSummary.net - target) < 0.01
                    ? ' = total a cobrar'
                    : ''}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Calculado con las tasas snapshot de cada orden al momento de crearla.
              {Math.abs(casheaSummary.net - target) >= 0.01
                ? ' Difiere del Total a cobrar: los targets del lote son snapshot al crear el lote (fórmula vigente en ese momento).'
                : ''}
            </p>
          </>
        ) : null}
        {rateInSummary ? (
          <div className="mt-3 sm:max-w-xs">
            <UsdRateSelect
              rates={usdRates}
              selectedId={selectedUsdRateId}
              currentRateId={currentRateId}
              onSelect={handleSelectRate}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Tasa del estado de cuenta y de la conversión de los cobros.
            </p>
          </div>
        ) : null}
      </FormSection>

      {/* Ajuste del total a cobrar (resta o suma) */}
      <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.UPDATE}>
        <FormSection
          title="Ajuste del total a cobrar"
          description={`Resta o suma sobre el total del lote, en ${
            fixed ? 'bolívares' : 'dólares'
          }. Úsalo cuando el deudor paga menos (o más) de lo facturado: el total a cobrar y el estado del lote se recalculan con el ajuste.`}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground block">
                  Tipo
                </span>
                <div className="inline-flex rounded-lg border overflow-hidden">
                  {(
                    [
                      { key: 'minus' as const, label: 'Resta' },
                      { key: 'plus' as const, label: 'Suma' },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAdjSign(opt.key)}
                      className={
                        'px-3 py-2 text-sm font-medium transition-colors ' +
                        (adjSign === opt.key
                          ? opt.key === 'minus'
                            ? 'bg-destructive-soft text-destructive'
                            : 'bg-success-soft text-success'
                          : 'hover:bg-accent')
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground block">
                  Monto ({unit})
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0,00"
                  className="h-9 w-40"
                />
              </div>
              <div className="flex-1 min-w-[220px] space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground block">
                  Motivo <span className="text-destructive">*</span>
                </span>
                <Input
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  maxLength={500}
                  placeholder="Motivo del ajuste (descuento del seguro, glosa, diferencia acordada…)"
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void saveAdjustment()}
                disabled={savingAdjustment || busy}
              >
                {savingAdjustment ? 'Guardando…' : 'Guardar ajuste'}
              </Button>
              {savedAdjustment ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void saveAdjustment(true)}
                  disabled={savingAdjustment || busy}
                >
                  Quitar ajuste
                </Button>
              ) : null}
            </div>
            {savedAdjustment ? (
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                <div>
                  Ajuste vigente:{' '}
                  <span
                    className={
                      savedAdjustment < 0
                        ? 'font-semibold text-destructive'
                        : 'font-semibold text-success'
                    }
                  >
                    {savedAdjustment < 0 ? '−' : '+'}
                    {formatMoney(Math.abs(savedAdjustment))} {unit}
                  </span>
                  {batch.adjustedBy ? (
                    <>
                      {' '}
                      · aplicado por{' '}
                      <span className="font-medium">
                        {orderUserDisplayName(batch.adjustedBy)}
                      </span>
                    </>
                  ) : null}
                  {batch.adjustedAt
                    ? ` el ${new Date(batch.adjustedAt).toLocaleString('es-VE')}`
                    : ''}
                  .
                </div>
                {batch.adjustmentNote ? (
                  <div className="text-muted-foreground">
                    Motivo: {batch.adjustmentNote}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </FormSection>
      </Can>

      {/* Estado de cuenta (sólo lotes de seguro) */}
      {debtorType === 'insurance' ? (
        <FormSection
          title="Estado de cuenta"
          description={
            fixed
              ? 'Seguro no indexado: el Excel usa la tasa fija de cada orden.'
              : 'Seguro indexado: el Excel usa la tasa seleccionada en el Resumen.'
          }
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Incluye las {batch.orders?.length ?? 0} órdenes del lote con
              titular, paciente, factura y montos en USD y Bs.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadStatement}
              disabled={downloadingStatement || (!fixed && !selectedMarketRate)}
            >
              <Download className="w-4 h-4 mr-1.5" />
              {downloadingStatement ? 'Generando…' : 'Descargar estado de cuenta'}
            </Button>
          </div>
          {!fixed && !selectedMarketRate ? (
            <p className="text-xs text-warning mt-2">
              Selecciona una tasa en el Resumen para generar el Excel.
            </p>
          ) : null}
        </FormSection>
      ) : null}

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
                          <div className="text-xs font-mono font-semibold flex items-center gap-1.5">
                            N° {c.orderNumber}
                            {portionLabel(c.portion) ? (
                              <Badge
                                variant="outline"
                                className="bg-brand-cyan-soft text-brand-cyan-strong border-brand-cyan/40 text-[10px] font-sans font-medium"
                              >
                                {portionLabel(c.portion)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {debtorType === 'cashea'
                              ? `${pendingDebtorName(c)} · `
                              : ''}
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
              <span className="font-mono font-medium inline-flex items-center gap-2">
                N° {o.order?.orderNumber ?? '—'}
                {portionLabel(o.portion) ? (
                  <Badge
                    variant="outline"
                    className="bg-brand-cyan-soft text-brand-cyan-strong border-brand-cyan/40 text-[10px] font-sans font-medium"
                  >
                    {portionLabel(o.portion)}
                  </Badge>
                ) : null}
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
                    {p.paymentDate ? formatDateOnly(p.paymentDate) : '—'}
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
                      usdRate={selectedMarketRate}
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
                  <div
                    className={`rounded-md border p-2 bg-muted/30${
                      rateInSummary ? ' col-span-2' : ''
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">
                      Total de los cobros cargados ({fixed ? 'Bs.' : 'USD'})
                      {rateInSummary && selectedMarketRate
                        ? ` · tasa del Resumen: ${formatMoney(Number(selectedMarketRate.amountBs))} Bs.`
                        : ''}
                    </div>
                    <div className="font-mono">
                      {fixed
                        ? `${formatMoney(totalPaymentsBs)} Bs.`
                        : `${formatMoney(totalPaymentsUsd)} USD`}
                    </div>
                  </div>
                  {!rateInSummary ? (
                    <UsdRateSelect
                      rates={fixed && fixedRate ? [fixedRate] : usdRates}
                      selectedId={fixed && fixedRate ? fixedRate.id : selectedUsdRateId}
                      currentRateId={currentRateId}
                      onSelect={handleSelectRate}
                      disabled={fixed && !!fixedRate}
                      lockNote={
                        fixed
                          ? 'Tasa fija de la orden (seguro no indexado): con ella se convierten los cobros en USD/EUR a Bs.'
                          : undefined
                      }
                    />
                  ) : null}
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
                      {bsRef(Math.abs(liveRemaining))
                        ? ` · ${bsRef(Math.abs(liveRemaining))}`
                        : ''}
                    </Badge>
                  ) : (
                    <Badge className="bg-warning text-white shrink-0">
                      Falta {formatMoney(liveRemaining)} {unit}
                      {bsRef(liveRemaining) ? ` · ${bsRef(liveRemaining)}` : ''}
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
  sub,
}: {
  label: string;
  value: string;
  tone?: 'success';
  sub?: string;
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
      {sub ? (
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      ) : null}
    </div>
  );
}
