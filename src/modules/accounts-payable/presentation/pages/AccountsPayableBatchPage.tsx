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
import { FormSwitch } from '@/components/ui/form-switch';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { formatDateOnly } from '@/lib/dates';
import { PageLoader } from '@/components/ui/spinner';
import { DatePicker } from '@/components/ui/date-picker';
import { egressPaymentSchema, type OrderPaymentValues } from '@/lib/validations/schemas';
import {
  OrderPaymentForm,
  paymentInBs,
  type PaymentItemErrors,
} from '@/modules/orders/presentation/components/OrderPaymentForm';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { UsdRateSelect } from '@/modules/exchange-rates/presentation/components/UsdRateSelect';
import { useUsdRates } from '@/modules/exchange-rates/presentation/hooks/useUsdRates';
import { useTaxUnit } from '@/lib/taxes/useTaxUnit';
import { TaxUnitSelect } from '@/modules/tax-units/presentation/components/TaxUnitSelect';
import type { TaxUnit } from '@/modules/tax-units/domain/models/taxUnit';
import {
  calcSliceRetention,
  type SliceRetentionResult,
  type SeniatPersonType,
} from '@/lib/taxes/seniatRetention';
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import {
  batchAppliesRetention,
  orderInternalNumber,
  pendingProviderId,
  pendingProviderName,
  personTypeOf,
  providerPaymentMethods,
  recipientName,
  settlementRateBs,
  type AccountsPayableBatch,
  type AccountsPayableSettlement,
  type PendingPayable,
} from '../../domain/models/accountsPayable';
import {
  PAYMENT_TYPE_LABEL,
  type OrderPaymentType,
} from '@/modules/orders/domain/models/order';
import { Can } from '@/modules/auth/presentation/components/Can';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Texto bajo el switch de retención según su estado (create + detalle). */
function retentionSwitchDescription(applies: boolean): string {
  return applies
    ? 'Cada abono retiene la parte de ISLR (Decreto 1.808) que le toca por la porción que cubre, y genera su obligación con el SENIAT.'
    : 'Sin retención: el proveedor recibe el bruto completo y no se genera obligación con el SENIAT.';
}

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
  // Retención SENIAT del lote: opcional, activada por defecto. El monto se
  // decide en cada abono, no acá.
  const [applyRetention, setApplyRetention] = useState(true);
  // Tasa de pago USD/Bs del lote: por defecto la vigente; define el neto en Bs.
  const { usdRates: createRates, currentRateId: createCurrentRateId } = useUsdRates();
  const [createRateId, setCreateRateId] = useState<string | null>(null);
  const createRate = useMemo<ExchangeRate | null>(() => {
    const wanted = createRateId ?? createCurrentRateId;
    return (wanted ? createRates.find((r) => r.id === wanted) : null) ?? null;
  }, [createRateId, createCurrentRateId, createRates]);
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

  const canCreate =
    selectedRows.length >= 1 && !!activeProvider && sameProvider;

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
        applyRetention,
        exchangeRateId: createRate?.id,
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
          title="Retención SENIAT"
          description="Define si este lote descuenta la retención de ISLR al proveedor. Puedes cambiarlo después mientras no tenga abonos."
        >
          <FormSwitch
            label="Aplicar retención de ISLR"
            description={retentionSwitchDescription(applyRetention)}
            checked={applyRetention}
            onCheckedChange={setApplyRetention}
          />
        </FormSection>

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
              {createRate
                ? ` ≈ ${formatMoney(selectedTotalUsd * Number(createRate.amountBs))} Bs. (bruto)`
                : ''}
            </div>
            {selectedRows.length > 0 && !sameProvider ? (
              <Badge className="bg-warning text-white shrink-0">
                Hay órdenes de otro proveedor
              </Badge>
            ) : null}
          </div>
        </FormSection>

        <FormSection
          title="Tasa de pago"
          description="Tasa USD/Bs por defecto del lote: la que se propone al primer abono y con la que se proyecta el saldo en Bs. Cada abono fija la suya al registrarse."
        >
          <UsdRateSelect
            className="max-w-md"
            rates={createRates}
            selectedId={createRate?.id ?? ''}
            currentRateId={createCurrentRateId}
            onSelect={setCreateRateId}
            allowCreate
            label="Tasa de pago (USD/Bs)"
          />
        </FormSection>

        {applyRetention ? (
          <FormSection
            title="Unidad Tributaria"
            description="UT con la que se calcula la retención de los abonos del lote. Por defecto la vigente; puedes seleccionar otra."
          >
            <TaxUnitSelect
              className="max-w-md"
              selectedId={batchTaxUnit?.id ?? null}
              selectedFallback={batchTaxUnit}
              onSelect={setSelectedTaxUnit}
            />
          </FormSection>
        ) : null}

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
  const { has: hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE);
  const [batch, setBatch] = useState<AccountsPayableBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});

  // Add-orders popover.
  const [candidates, setCandidates] = useState<PendingPayable[]>([]);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSel, setCandidateSel] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSettlementDelete, setConfirmSettlementDelete] = useState<string | null>(
    null,
  );
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(null);
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

  const providerId =
    batch?.recipientType === 'doctor' ? batch?.doctorId : batch?.careCenterId;

  // Cuentas registradas del proveedor (para precargar banco/cuenta en el pago).
  // Llegan anidadas en el lote, así que no hay un segundo request encadenado.
  const recipientMethods = useMemo(
    () => (batch ? providerPaymentMethods(batch) : []),
    [batch],
  );

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

  // Tasa de facturación (USD/Bs) de la primera orden: fallback para lotes
  // previos sin tasa de pago propia (el BE aplica la misma regla).
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

  // Tasa por defecto del lote: la que se propone al próximo abono y con la que
  // el BE proyecta el saldo pendiente en Bs. Los abonos ya hechos tienen la suya.
  const batchRate = useMemo<ExchangeRate | null>(() => {
    const er = batch?.exchangeRate;
    if (!er) return null;
    return {
      id: er.id,
      currency: er.currency,
      amountBs: String(er.amountBs),
      effectiveDate: er.effectiveDate ?? '',
      isActive: er.isActive ?? true,
    } as ExchangeRate;
  }, [batch]);
  const defaultRate = batchRate ?? usdRate;

  const { usdRates, currentRateId } = useUsdRates();
  const ratesForSelect = useMemo<ExchangeRate[]>(() => {
    const list = [...usdRates];
    const push = (r: ExchangeRate | null) => {
      if (r && !list.some((x) => x.id === r.id)) list.push(r);
    };
    push(batchRate);
    push(usdRate);
    // Tasas ya snapshoteadas en abonos del lote (para prefijar al editar).
    for (const s of batch?.settlements ?? []) {
      const er = s.exchangeRate;
      if (er && er.currency === 'USD') {
        push({
          id: er.id,
          currency: 'USD',
          amountBs: String(er.amountBs),
          effectiveDate: '',
          isActive: true,
        } as ExchangeRate);
      }
    }
    return list;
  }, [usdRates, batchRate, usdRate, batch]);

  // ---------------- Abono en edición/alta ----------------
  const todayIso = new Date().toISOString().slice(0, 10);
  const [settlementDate, setSettlementDate] = useState(todayIso);
  const [coveredUsd, setCoveredUsd] = useState<number | undefined>(undefined);
  const [formRateId, setFormRateId] = useState<string | null>(null);
  const [customOn, setCustomOn] = useState(false);
  const [customRetentionBs, setCustomRetentionBs] = useState<number | undefined>(
    undefined,
  );

  const methods = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    mode: 'onBlur',
    defaultValues: { payments: [] },
  });
  const { handleSubmit, formState, control, setValue, getValues, reset } = methods;

  const appliesRetention = batch ? batchAppliesRetention(batch) : true;
  const grossUsd = batch?.grossUsd ?? 0;
  const editingSettlement = useMemo(
    () =>
      (batch?.settlements ?? []).find((s) => s.id === editingSettlementId) ?? null,
    [batch, editingSettlementId],
  );
  // Saldo disponible para el abono: lo que falta (más lo que libera el abono
  // que se está editando, que se reemplaza por completo).
  const availableUsd = round2(
    (batch?.pendingUsd ?? 0) + Number(editingSettlement?.coveredUsd ?? 0),
  );

  const formRate = useMemo<ExchangeRate | null>(
    () => ratesForSelect.find((r) => r.id === formRateId) ?? null,
    [ratesForSelect, formRateId],
  );
  const formRateBs = Number(formRate?.amountBs ?? 0);

  // Valores por defecto del formulario: cubrir TODO el saldo a la tasa del lote.
  const resetSettlementForm = useCallback(() => {
    setEditingSettlementId(null);
    setSettlementDate(todayIso);
    setCoveredUsd(undefined);
    setFormRateId(null);
    setCustomOn(false);
    setCustomRetentionBs(undefined);
    reset({ payments: [] });
  }, [reset, todayIso]);

  // Alta: precargar saldo y tasa del lote en cuanto se conocen.
  useEffect(() => {
    if (editingSettlementId) return;
    setCoveredUsd((prev) =>
      prev === undefined && (batch?.pendingUsd ?? 0) > 0 ? batch?.pendingUsd : prev,
    );
    setFormRateId((prev) => prev ?? defaultRate?.id ?? null);
  }, [batch?.pendingUsd, defaultRate?.id, editingSettlementId]);

  const seniatPersonType: SeniatPersonType = batch
    ? personTypeOf(batch)
    : 'natural';
  const effectiveTaxUnit = batch?.taxUnit ?? taxUnit;
  const taxUnitBs = effectiveTaxUnit ? Number(effectiveTaxUnit.amountBs) : 0;

  // Retención prorrateada del abono: la del bruto TOTAL a esta tasa, por la
  // porción que cubre. Espejo exacto del cálculo del BE.
  const slice: SliceRetentionResult | null =
    appliesRetention && taxUnitBs > 0
      ? calcSliceRetention({
          sliceUsd: coveredUsd ?? 0,
          totalUsd: grossUsd,
          rateBs: formRateBs,
          personType: seniatPersonType,
          taxUnitBs,
        })
      : null;
  const autoRetentionBs = slice?.taxAmountBs ?? 0;
  const settlementGrossBs = round2((coveredUsd ?? 0) * formRateBs);
  const retentionBs = !appliesRetention
    ? 0
    : customOn
      ? (customRetentionBs ?? 0)
      : autoRetentionBs;
  const settlementNetBs = round2(settlementGrossBs - retentionBs);

  const lookupRate = useCallback(
    (rid: string): ExchangeRate | null =>
      eurRatesById[rid] ?? ratesForSelect.find((r) => r.id === rid) ?? null,
    [eurRatesById, ratesForSelect],
  );

  const watchedPayments = methods.watch('payments') ?? [];
  const rowsBs = useMemo(
    () =>
      round2(
        watchedPayments.reduce(
          (sum, p) => sum + paymentInBs(p, formRate, lookupRate),
          0,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedPayments, formRate, eurRatesById],
  );
  const rowsDiff = round2(settlementNetBs - rowsBs);
  const rowsBalanced = Math.abs(rowsDiff) <= 0.01;
  const coveredValid =
    (coveredUsd ?? 0) > 0 && (coveredUsd ?? 0) - availableUsd <= 0.01;
  const canSubmitSettlement =
    coveredValid &&
    formRateBs > 0 &&
    settlementNetBs > 0 &&
    rowsBalanced &&
    watchedPayments.length > 0 &&
    (!customOn || customRetentionBs !== undefined);

  const paymentDefaults = (type: OrderPaymentType): OrderPaymentValues => {
    const base = {
      type,
      paymentDate: settlementDate || todayIso,
      referenceNumber: '',
      bankCode: '',
      exchangeRateId: '',
      accountNumber: '',
      amountValue: 0,
    };
    if (type === 'mobile_payment' || type === 'bank_transfer' || type === 'cash_bs') {
      return { ...base, exchangeRateId: formRate?.id ?? '', amountCurrency: 'BS' };
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

  /** Cambiar la tasa del abono realinea las filas en Bs (van siempre a esa tasa). */
  const onSelectFormRate = (rateId: string) => {
    setFormRateId(rateId);
    const rows = getValues('payments') ?? [];
    if (rows.length) {
      setValue(
        'payments',
        rows.map((p) =>
          p.amountCurrency === 'BS' ? { ...p, exchangeRateId: rateId } : p,
        ),
        { shouldDirty: true },
      );
    }
  };

  const onSubmitSettlement = async (values: PaymentFormValues) => {
    if (!formRate) return;
    setBusy(true);
    try {
      const dto = {
        settlementDate,
        coveredUsd: round2(coveredUsd ?? 0),
        exchangeRateId: formRate.id,
        taxUnitId: effectiveTaxUnit?.id,
        customRetentionBs:
          appliesRetention && customOn ? (customRetentionBs ?? 0) : null,
        payments: values.payments.map((p) => ({
          type: p.type,
          paymentDate: p.paymentDate,
          referenceNumber: p.referenceNumber || undefined,
          bankCode: p.bankCode || undefined,
          accountNumber: p.accountNumber || undefined,
          // Filas en Bs: la tasa del abono (están bloqueadas a ella). Filas en
          // EUR llevan su tasa EUR/Bs; las de USD caen a la del abono.
          exchangeRateId:
            p.amountCurrency === 'BS'
              ? formRate.id
              : p.exchangeRateId || formRate.id,
          amountCurrency: p.amountCurrency,
          amountValue: p.amountValue,
        })),
      };
      const updated = editingSettlementId
        ? await accountsPayableGateway.editSettlement(id, editingSettlementId, dto)
        : await accountsPayableGateway.registerSettlement(id, dto);
      notify.success(editingSettlementId ? 'Abono actualizado' : 'Abono registrado');
      setBatch(updated);
      resetSettlementForm();
    } catch (e) {
      notify.fromError(e, 'No se pudo registrar el abono');
    } finally {
      setBusy(false);
    }
  };

  const startEditSettlement = (settlementId: string) => {
    const s = (batch?.settlements ?? []).find((x) => x.id === settlementId);
    if (!s) return;
    setEditingSettlementId(settlementId);
    setSettlementDate(s.settlementDate?.slice(0, 10) || todayIso);
    setCoveredUsd(Number(s.coveredUsd) || 0);
    setFormRateId(s.exchangeRateId);
    setCustomOn(!!s.isCustomRetention);
    setCustomRetentionBs(s.isCustomRetention ? Number(s.retentionBs) : undefined);
    reset({
      payments: (s.payments ?? []).map(
        (p) =>
          ({
            type: p.type,
            paymentDate: p.paymentDate?.slice(0, 10) || todayIso,
            referenceNumber: p.referenceNumber ?? '',
            bankCode: p.bankCode ?? '',
            accountNumber: p.accountNumber ?? '',
            exchangeRateId:
              p.amountCurrency === 'BS'
                ? s.exchangeRateId
                : (p.exchangeRateId ?? ''),
            amountCurrency: p.amountCurrency,
            amountValue: Number(p.amountValue) || 0,
          }) as OrderPaymentValues,
      ),
    });
    document.getElementById('ap-settlement-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const onDeleteSettlement = async (settlementId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.deleteSettlement(id, settlementId));
      notify.success('Abono eliminado');
      if (editingSettlementId === settlementId) resetSettlementForm();
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el abono');
    } finally {
      setBusy(false);
      setConfirmSettlementDelete(null);
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

  const onSetRetention = async (next: boolean) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.setRetention(id, next));
      notify.success(
        next ? 'Retención de ISLR activada' : 'Retención de ISLR desactivada',
      );
    } catch (e) {
      notify.fromError(e, 'No se pudo cambiar la retención');
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
    return <PageLoader label="Cargando lote…" />;
  }

  const settlements = batch.settlements ?? [];
  const hasSettlements = settlements.length > 0;
  const pendingUsdValue = batch.pendingUsd ?? 0;
  const showSettlementForm = canUpdate && (editingSettlementId || availableUsd > 0.01);

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
            {batch.recipientType === 'doctor' ? 'Doctor' : 'Centro'} ·{' '}
            {STATUS_TEXT[batch.status]}
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

      {/* Retención (opcional por lote) */}
      <FormSection
        title="Retención SENIAT"
        description="Define si este lote descuenta la retención de ISLR al proveedor. Cada abono practica su propia retención."
      >
        <FormSwitch
          label="Aplicar retención de ISLR"
          description={retentionSwitchDescription(appliesRetention)}
          checked={appliesRetention}
          onCheckedChange={onSetRetention}
          disabled={hasSettlements || busy || !canUpdate}
        />
        {hasSettlements ? (
          <p className="text-xs text-muted-foreground mt-2">
            El lote ya tiene abonos: para cambiar el régimen de retención, elimina
            sus abonos primero.
          </p>
        ) : null}
      </FormSection>

      {/* Totales */}
      <FormSection
        title="Resumen"
        description={`El saldo del lote se lleva en USD: cada abono cubre una porción a su propia tasa y con su propia retención. Los Bs del saldo pendiente son una proyección${
          defaultRate
            ? ` a la tasa por defecto del lote (1 USD = ${formatMoney(defaultRate.amountBs)} Bs.)`
            : ''
        }.`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <SummaryTile label="Bruto del lote" value={`${formatMoney(grossUsd)} USD`} />
          <SummaryTile
            label="Abonado"
            value={`${formatMoney(batch.coveredUsd ?? 0)} USD`}
          />
          <SummaryTile
            label="Falta por pagar"
            value={`${formatMoney(pendingUsdValue)} USD`}
            tone={pendingUsdValue > 0.01 ? 'warning' : 'success'}
          />
          <SummaryTile
            label="Entregado al proveedor"
            value={`${formatMoney(batch.paidBs ?? 0)} Bs.`}
            tone="success"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3">
          <SummaryTile
            label="Retención practicada"
            value={
              appliesRetention
                ? `${formatMoney(batch.settledRetentionBs ?? 0)} Bs.`
                : 'No aplica'
            }
            tone={appliesRetention ? 'warning' : undefined}
          />
          <SummaryTile
            label="Bruto abonado"
            value={`${formatMoney(batch.settledGrossBs ?? 0)} Bs.`}
          />
          <SummaryTile
            label="Saldo proyectado"
            value={`${formatMoney(batch.pendingBs ?? 0)} Bs.`}
          />
          <SummaryTile
            label="Total estimado del lote"
            value={`${formatMoney(batch.netBs ?? 0)} Bs.`}
          />
        </div>

        {appliesRetention ? (
          <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
            <div className="mt-4">
              <TaxUnitSelect
                className="max-w-md"
                label="Unidad Tributaria del lote"
                placeholder="UT vigente al calcular"
                selectedId={batch.taxUnitId ?? null}
                selectedFallback={batch.taxUnit ?? null}
                onSelect={(ut) => onSetTaxUnit(ut.id)}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                UT con la que se calcula la retención de los PRÓXIMOS abonos. Los
                abonos ya registrados conservan la suya.
              </p>
            </div>
          </Can>
        ) : null}
      </FormSection>

      {/* Órdenes */}
      <FormSection
        title={`Órdenes del lote (${batch.orders?.length ?? 0})`}
        description="Órdenes internas del proveedor incluidas en este lote."
      >
        <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
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
        </Can>

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
                <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
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
                </Can>
              </div>
            </li>
          ))}
        </ul>
      </FormSection>

      {/* Abonos registrados */}
      <FormSection
        title={`Abonos registrados (${settlements.length})`}
        description="Cada abono cubre una porción del lote en USD, a su tasa, con su retención y su obligación con el SENIAT."
      >
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sin abonos registrados.</p>
        ) : (
          <ul className="space-y-3">
            {settlements.map((s, idx) => (
              <SettlementCard
                key={s.id}
                index={idx + 1}
                settlement={s}
                onEdit={() => startEditSettlement(s.id)}
                onDelete={() => setConfirmSettlementDelete(s.id)}
                busy={busy}
                editing={editingSettlementId === s.id}
              />
            ))}
          </ul>
        )}
      </FormSection>

      {/* Registrar / editar abono */}
      {showSettlementForm ? (
        <div id="ap-settlement-form">
          <FormProvider {...methods}>
            <form
              onSubmit={handleSubmit(onSubmitSettlement, (errs) =>
                notifyFormErrors(errs),
              )}
            >
              <FormSection
                title={editingSettlementId ? 'Editar abono' : 'Registrar abono'}
                description={
                  appliesRetention
                    ? 'Indica cuántos USD del lote cubre este pago y a qué tasa: se calculan el bruto, la retención de ISLR y el neto a transferir.'
                    : 'Indica cuántos USD del lote cubre este pago y a qué tasa. Este lote no descuenta retención: el proveedor recibe el bruto.'
                }
              >
                {ratesForSelect.length === 0 ? (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    No hay tasas USD/Bs cargadas; no se puede registrar el abono.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Fecha del abono
                        </label>
                        <DatePicker
                          value={settlementDate}
                          onChange={(v) => setSettlementDate(v ?? todayIso)}
                          disabled={busy}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Define el período fiscal de su retención.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="ap-covered-usd"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          USD del lote a cubrir
                        </label>
                        <CurrencyAmountInput
                          id="ap-covered-usd"
                          currencyPrefix="$ "
                          value={coveredUsd}
                          onChange={setCoveredUsd}
                          disabled={busy}
                          invalid={!coveredValid}
                        />
                        <button
                          type="button"
                          className="text-[11px] text-brand-blue hover:underline"
                          onClick={() => setCoveredUsd(availableUsd)}
                          disabled={busy}
                        >
                          Cubrir todo el saldo ({formatMoney(availableUsd)} USD)
                        </button>
                      </div>
                      <div className="space-y-1">
                        <UsdRateSelect
                          rates={ratesForSelect}
                          selectedId={formRate?.id ?? ''}
                          currentRateId={currentRateId}
                          onSelect={onSelectFormRate}
                          allowCreate
                          disabled={busy}
                          label="Tasa del abono (USD/Bs)"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          La tasa a la que se pagó ESTA porción. No afecta a los
                          abonos anteriores.
                        </p>
                      </div>
                    </div>

                    {appliesRetention ? (
                      <div className="mt-4 pt-4 border-t">
                        <FormSwitch
                          label="Monto de retención manual"
                          description={
                            customOn
                              ? 'La retención de este abono NO se calcula: se retiene el monto en Bs que indiques.'
                              : 'La retención se calcula prorrateando la del lote completo por la porción que cubre este abono.'
                          }
                          checked={customOn}
                          onCheckedChange={(next) => {
                            setCustomOn(next);
                            setCustomRetentionBs(next ? autoRetentionBs : undefined);
                          }}
                          disabled={busy}
                        />
                        {customOn ? (
                          <div className="mt-3 w-full max-w-xs space-y-1">
                            <label
                              htmlFor="ap-custom-retention"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Monto a retener (Bs.)
                            </label>
                            <CurrencyAmountInput
                              id="ap-custom-retention"
                              value={customRetentionBs}
                              onChange={setCustomRetentionBs}
                              disabled={busy}
                              invalid={customRetentionBs === undefined}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Cálculo de referencia: {formatMoney(autoRetentionBs)} Bs.
                            </p>
                          </div>
                        ) : null}
                        <SeniatBreakdown
                          personType={seniatPersonType}
                          taxUnitBs={taxUnitBs}
                          result={slice}
                          customRetentionBs={customOn ? (customRetentionBs ?? 0) : null}
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <SummaryTile
                        label="Bruto del abono"
                        value={`${formatMoney(settlementGrossBs)} Bs.`}
                      />
                      <SummaryTile
                        label="Retención"
                        value={
                          appliesRetention
                            ? `${formatMoney(retentionBs)} Bs.`
                            : 'No aplica'
                        }
                        tone={appliesRetention ? 'warning' : undefined}
                      />
                      <SummaryTile
                        label="Neto a transferir"
                        value={`${formatMoney(settlementNetBs)} Bs.`}
                        tone="success"
                      />
                    </div>

                    <div className="mt-4">
                      <Controller
                        control={control}
                        name="payments"
                        render={({ field }) => (
                          <OrderPaymentForm
                            payments={(field.value ?? []) as OrderPaymentValues[]}
                            onChange={(next) => field.onChange(next)}
                            usdRate={formRate}
                            onEurRateLoaded={(r) =>
                              setEurRatesById((prev) =>
                                prev[r.id] ? prev : { ...prev, [r.id]: r },
                              )
                            }
                            rateSelectable
                            rateLocked
                            rateLockedNote="Fijada a la tasa del abono; cámbiala arriba en «Tasa del abono (USD/Bs)»."
                            onRatesLoaded={(rates) =>
                              setEurRatesById((prev) => {
                                const missing = rates.filter((r) => !prev[r.id]);
                                if (!missing.length) return prev;
                                const next = { ...prev };
                                for (const r of missing) next[r.id] = r;
                                return next;
                              })
                            }
                            errors={buildPaymentErrors(
                              (formState.errors as { payments?: unknown }).payments,
                            )}
                            hideAddButtons
                            onRemovePayment={removePaymentAt}
                            usePaymentAccount={false}
                            recipientMethods={recipientMethods}
                            remaining={{ amount: rowsDiff, currency: 'BS' }}
                          />
                        )}
                      />
                    </div>

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

                    <div className="mt-3 rounded-md border p-3 flex items-center justify-between gap-3 text-sm">
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Formas de pago {formatMoney(rowsBs)} / neto{' '}
                        {formatMoney(settlementNetBs)} Bs.
                      </div>
                      {rowsBalanced && watchedPayments.length > 0 ? (
                        <Badge className="bg-success text-white shrink-0">Cuadrado</Badge>
                      ) : rowsDiff < 0 ? (
                        <Badge className="bg-destructive text-white shrink-0">
                          Excede {formatMoney(-rowsDiff)} Bs.
                        </Badge>
                      ) : (
                        <Badge className="bg-warning text-white shrink-0">
                          Falta {formatMoney(rowsDiff)} Bs.
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4">
                      {editingSettlementId ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetSettlementForm}
                        >
                          Cancelar edición
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        disabled={busy || formState.isSubmitting || !canSubmitSettlement}
                      >
                        {busy || formState.isSubmitting
                          ? 'Guardando…'
                          : editingSettlementId
                            ? 'Guardar abono'
                            : (coveredUsd ?? 0) >= availableUsd - 0.01
                              ? 'Registrar abono final'
                              : 'Registrar abono parcial'}
                      </Button>
                    </div>
                  </>
                )}
              </FormSection>
            </form>
          </FormProvider>
        </div>
      ) : canUpdate ? (
        <FormSection
          title="Registrar abono"
          description="El lote está totalmente abonado. Edita o elimina un abono para liberar saldo."
        >
          <p className="text-sm text-muted-foreground italic">
            No queda saldo por pagar en este lote.
          </p>
        </FormSection>
      ) : null}

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
                  Se borrarán sus abonos y las órdenes volverán a Pendientes. No se
                  puede anular si alguna retención ya fue pagada al SENIAT.
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
        open={!!confirmSettlementDelete}
        onOpenChange={(o) => !o && setConfirmSettlementDelete(null)}
      >
        <AlertDialogContent className="rounded-xl shadow-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive-soft text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle>Eliminar abono</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán sus formas de pago y su retención con el SENIAT, y el
                  lote volverá a deber esos USD.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmSettlementDelete && onDeleteSettlement(confirmSettlementDelete)
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

/** Ficha de un abono: porción cubierta, tasa, retención, neto y sus pagos. */
function SettlementCard({
  index,
  settlement,
  onEdit,
  onDelete,
  busy,
  editing,
}: {
  index: number;
  settlement: AccountsPayableSettlement;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
  editing: boolean;
}) {
  const rateBs = settlementRateBs(settlement);
  return (
    <li
      className={`rounded-lg border bg-card p-3 ${
        editing ? 'border-brand-blue ring-1 ring-brand-blue/30' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold">Abono {index}</span>
            <span className="font-mono text-sm">
              {formatMoney(settlement.coveredUsd)} USD
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatDateOnly(settlement.settlementDate)} · 1 USD ={' '}
              {formatMoney(rateBs)} Bs.
            </span>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            Bruto {formatMoney(settlement.grossBs)} Bs. · Retención{' '}
            {formatMoney(settlement.retentionBs)} Bs.
            {settlement.isCustomRetention ? ' (manual)' : ''} · Neto{' '}
            {formatMoney(settlement.netBs)} Bs.
          </div>
          <ul className="text-[11px] text-muted-foreground divide-y border-t mt-1.5 pt-1.5">
            {(settlement.payments ?? []).map((p) => (
              <li key={p.id} className="py-1 font-mono">
                {PAYMENT_TYPE_LABEL[p.type]} ·{' '}
                {p.paymentDate ? formatDateOnly(p.paymentDate) : '—'} ·{' '}
                {formatMoney(p.amountValue)} {p.amountCurrency} ·{' '}
                {formatMoney(p.amountInBs)} Bs.
                {p.referenceNumber ? ` · Ref. ${p.referenceNumber}` : ''}
              </li>
            ))}
          </ul>
        </div>
        <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              disabled={busy}
              title="Editar abono"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={busy}
              title="Eliminar abono"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </Can>
      </div>
    </li>
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

/**
 * Desglose del cálculo de la retención de UN abono (ISLR, Decreto 1.808): la
 * retención del bruto total a la tasa del abono, prorrateada por la porción que
 * cubre — por eso el sustraendo aparece prorrateado y el mínimo no sujeto es el
 * del total.
 */
function SeniatBreakdown({
  personType,
  taxUnitBs,
  result,
  customRetentionBs,
}: {
  personType: SeniatPersonType;
  taxUnitBs: number | null;
  result: SliceRetentionResult | null;
  /** Monto manual del abono (Bs); null = la retención es el cálculo prorrateado. */
  customRetentionBs: number | null;
}) {
  const isLegal = personType === 'legal_entity';
  const regimen = isLegal
    ? 'Persona jurídica domiciliada (5%)'
    : 'Persona natural residente (3%)';

  const tiles: { label: string; value: string; tone?: 'warning' }[] = [];
  if (result) {
    tiles.push({
      label: 'Base imponible del abono',
      value: `${formatMoney(result.sliceGrossBs)} Bs.`,
    });
    tiles.push({ label: 'Tasa aplicada', value: `${(result.taxRate * 100).toFixed(0)}%` });
    tiles.push({
      label: 'Porción del lote',
      value: `${(result.share * 100).toFixed(2)} %`,
    });
    if (!isLegal) {
      tiles.push({ label: 'Valor UT', value: `${formatMoney(taxUnitBs ?? 0)} Bs.` });
      tiles.push({
        label: 'Sustraendo (prorrateado)',
        value: `${formatMoney(result.subtrahendBs)} Bs.`,
      });
      tiles.push({
        label: 'Mínimo no sujeto (total)',
        value: `${formatMoney(result.thresholdBs)} Bs.`,
      });
    }
    const autoValue = result.belowThreshold
      ? 'Exento'
      : `${formatMoney(result.taxAmountBs)} Bs.`;
    if (customRetentionBs !== null) {
      // Monto manual: el cálculo prorrateado queda sólo como referencia.
      tiles.push({ label: 'Cálculo prorrateado', value: autoValue });
      tiles.push({
        label: 'Retención (manual)',
        value: `${formatMoney(customRetentionBs)} Bs.`,
        tone: 'warning',
      });
    } else {
      tiles.push({ label: 'Retención del abono', value: autoValue, tone: 'warning' });
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Desglose de la retención del abono · ISLR (Decreto 1.808)
        </div>
        <div className="text-xs text-muted-foreground">{regimen}</div>
      </div>
      {!result ? (
        <p className="text-xs italic text-muted-foreground">
          No hay Unidad Tributaria vigente configurada; no se puede desglosar el
          cálculo.
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
