import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { formatDateOnly } from '@/lib/dates';
import { PageLoader } from '@/components/ui/spinner';
import { DatePicker } from '@/components/ui/date-picker';
import type { RecipientPaymentMethod } from '@/modules/orders/presentation/components/OrderPaymentForm';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import { selectableBanks, type Bank } from '@/modules/banks/domain/models/bank';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { loadActiveRates } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
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

/** Texto bajo el switch de retención (modo creación). */
function retentionSwitchDescription(applies: boolean): string {
  return applies
    ? 'Cada pago retiene la parte de ISLR (Decreto 1.808) que le toca por la porción que cubre, y genera su obligación con el SENIAT.'
    : 'Sin retención: el proveedor recibe el bruto completo y no se genera obligación con el SENIAT.';
}

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
          description="Define si este lote descuenta la retención de ISLR al proveedor. Puedes cambiarlo después mientras no tenga pagos."
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
          description="Tasa USD/Bs que se propone al primer pago. Cada pago fija la suya al registrarse."
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
            description="UT con la que se calcula la retención de los pagos del lote. Por defecto la vigente; puedes seleccionar otra."
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
type PaymentDraft = {
  type: OrderPaymentType;
  date: string;
  bankCode: string;
  referenceNumber: string;
  accountNumber: string;
  /** Cuenta registrada del proveedor elegida ('' = manual). */
  recipientMethodId: string;
  coveredUsd: number | undefined;
  rateId: string | null;
  customOn: boolean;
  customRetentionBs: number | undefined;
};

const emptyDraft = (date: string): PaymentDraft => ({
  type: 'bank_transfer',
  date,
  bankCode: '',
  referenceNumber: '',
  accountNumber: '',
  recipientMethodId: '',
  coveredUsd: undefined,
  rateId: null,
  customOn: false,
  customRetentionBs: undefined,
});

function BatchDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { taxUnit } = useTaxUnit();
  const { has: hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE);
  const [batch, setBatch] = useState<AccountsPayableBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [eurRate, setEurRate] = useState<ExchangeRate | null>(null);

  // Add-orders popover.
  const [candidates, setCandidates] = useState<PendingPayable[]>([]);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSel, setCandidateSel] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPaymentDelete, setConfirmPaymentDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  useEffect(() => {
    bankGateway
      .list()
      .then(setBanks)
      .catch(() => setBanks([]));
    loadActiveRates('EUR')
      .then(({ current }) => setEurRate(current))
      .catch(() => setEurRate(null));
  }, []);

  const providerId =
    batch?.recipientType === 'doctor' ? batch?.doctorId : batch?.careCenterId;
  // Cuentas registradas del proveedor: vienen anidadas en el lote.
  const recipientMethods = useMemo(
    () => (batch ? providerPaymentMethods(batch) : []),
    [batch],
  );

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

  // Tasa por defecto del lote (la del último pago, o la de facturación).
  const defaultRate = useMemo<ExchangeRate | null>(() => {
    const er = batch?.exchangeRate;
    if (er) {
      return {
        id: er.id,
        currency: er.currency,
        amountBs: String(er.amountBs),
        effectiveDate: er.effectiveDate ?? '',
        isActive: er.isActive ?? true,
      } as ExchangeRate;
    }
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

  const { usdRates, currentRateId } = useUsdRates();
  const ratesForSelect = useMemo<ExchangeRate[]>(() => {
    const list = [...usdRates];
    const push = (r: ExchangeRate | null) => {
      if (r && !list.some((x) => x.id === r.id)) list.push(r);
    };
    push(defaultRate);
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
  }, [usdRates, defaultRate, batch]);

  // ---------------- Formulario de pago ----------------
  const todayIso = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<PaymentDraft>(() => emptyDraft(todayIso));
  const patch = (p: Partial<PaymentDraft>) => setDraft((d) => ({ ...d, ...p }));

  const appliesRetention = batch ? batchAppliesRetention(batch) : true;
  const grossUsd = batch?.grossUsd ?? 0;
  const payments = batch?.settlements ?? [];
  const editing = payments.find((s) => s.id === editingId) ?? null;
  // Saldo disponible: lo que falta más lo que libera el pago en edición.
  const availableUsd = round2(
    (batch?.pendingUsd ?? 0) + Number(editing?.coveredUsd ?? 0),
  );
  const coveredUsd = draft.coveredUsd ?? availableUsd;
  const rateId = draft.rateId ?? defaultRate?.id ?? null;
  const rate = ratesForSelect.find((r) => r.id === rateId) ?? null;
  const rateBs = Number(rate?.amountBs ?? 0);

  const personType: SeniatPersonType = batch ? personTypeOf(batch) : 'natural';
  const effectiveTaxUnit = batch?.taxUnit ?? taxUnit;
  const taxUnitBs = effectiveTaxUnit ? Number(effectiveTaxUnit.amountBs) : 0;
  const slice: SliceRetentionResult | null =
    appliesRetention && taxUnitBs > 0
      ? calcSliceRetention({
          sliceUsd: coveredUsd,
          totalUsd: grossUsd,
          rateBs,
          personType,
          taxUnitBs,
        })
      : null;
  const autoRetentionBs = slice?.taxAmountBs ?? 0;
  const grossBs = round2(coveredUsd * rateBs);
  const retentionBs = !appliesRetention
    ? 0
    : draft.customOn
      ? (draft.customRetentionBs ?? 0)
      : autoRetentionBs;
  const netBs = round2(grossBs - retentionBs);

  // Moneda y monto del movimiento, derivados del neto.
  const currency: 'BS' | 'USD' | 'EUR' =
    draft.type === 'cash_usd' || draft.type === 'other'
      ? 'USD'
      : draft.type === 'cash_eur'
        ? 'EUR'
        : 'BS';
  const eurBs = Number(eurRate?.amountBs ?? 0);
  const amount =
    currency === 'BS'
      ? netBs
      : currency === 'USD'
        ? rateBs > 0
          ? round2(netBs / rateBs)
          : 0
        : eurBs > 0
          ? round2(netBs / eurBs)
          : 0;

  const needsBank = draft.type === 'mobile_payment' || draft.type === 'bank_transfer';
  const needsRef = needsBank || draft.type === 'other';
  const bankOptions = useMemo(
    () => selectableBanks(banks, draft.bankCode || null),
    [banks, draft.bankCode],
  );
  const methodsForType = useMemo(
    () => recipientMethods.filter((m) => m.type === draft.type),
    [recipientMethods, draft.type],
  );

  const coveredValid = coveredUsd > 0 && coveredUsd - availableUsd <= 0.01;
  const canSubmit =
    coveredValid &&
    rateBs > 0 &&
    netBs > 0 &&
    amount > 0 &&
    !!draft.date &&
    (!needsBank || !!draft.bankCode) &&
    (!needsRef || !!draft.referenceNumber.trim()) &&
    (currency !== 'EUR' || eurBs > 0) &&
    (!draft.customOn || draft.customRetentionBs !== undefined);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setDraft(emptyDraft(todayIso));
  }, [todayIso]);

  const onSubmit = async () => {
    if (!rate || !canSubmit) return;
    setBusy(true);
    try {
      const dto = {
        settlementDate: draft.date,
        coveredUsd: round2(coveredUsd),
        exchangeRateId: rate.id,
        taxUnitId: effectiveTaxUnit?.id,
        customRetentionBs:
          appliesRetention && draft.customOn ? (draft.customRetentionBs ?? 0) : null,
        payments: [
          {
            type: draft.type,
            paymentDate: draft.date,
            referenceNumber: draft.referenceNumber.trim() || undefined,
            bankCode: needsBank ? draft.bankCode : undefined,
            accountNumber:
              draft.type === 'other' ? draft.accountNumber.trim() || undefined : undefined,
            exchangeRateId: currency === 'EUR' ? eurRate?.id : rate.id,
            amountCurrency: currency,
            amountValue: amount,
          },
        ],
      };
      const updated = editingId
        ? await accountsPayableGateway.editSettlement(id, editingId, dto)
        : await accountsPayableGateway.registerSettlement(id, dto);
      notify.success(editingId ? 'Pago actualizado' : 'Pago registrado');
      setBatch(updated);
      resetForm();
    } catch (e) {
      notify.fromError(e, 'No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (settlementId: string) => {
    const s = payments.find((x) => x.id === settlementId);
    if (!s) return;
    const p = s.payments?.[0];
    setEditingId(settlementId);
    setDraft({
      type: p?.type ?? 'bank_transfer',
      date: s.settlementDate?.slice(0, 10) || todayIso,
      bankCode: p?.bankCode ?? '',
      referenceNumber: p?.referenceNumber ?? '',
      accountNumber: p?.accountNumber ?? '',
      recipientMethodId: '',
      coveredUsd: Number(s.coveredUsd) || 0,
      rateId: s.exchangeRateId,
      customOn: !!s.isCustomRetention,
      customRetentionBs: s.isCustomRetention ? Number(s.retentionBs) : undefined,
    });
    document.getElementById('ap-payment-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const onDeletePayment = async (settlementId: string) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.deleteSettlement(id, settlementId));
      notify.success('Pago eliminado');
      if (editingId === settlementId) resetForm();
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

  const onSetRetention = async (next: boolean) => {
    setBusy(true);
    try {
      setBatch(await accountsPayableGateway.setRetention(id, next));
      notify.success(next ? 'Retención de ISLR activada' : 'Retención de ISLR desactivada');
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

  const pendingUsdValue = batch.pendingUsd ?? 0;
  const showForm = canUpdate && (editingId || availableUsd > 0.01);
  const isLegal = personType === 'legal_entity';

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

      {/* Resumen */}
      <FormSection
        title="Resumen"
        description="El saldo se lleva en USD. Cada pago se registra a su propia tasa y retiene su propia parte de ISLR."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <SummaryTile label="Total del lote" value={`${formatMoney(grossUsd)} USD`} />
          <SummaryTile
            label="Pagado"
            value={`${formatMoney(batch.coveredUsd ?? 0)} USD`}
            sub={`${formatMoney(batch.paidBs ?? 0)} Bs. entregados`}
          />
          <SummaryTile
            label="Falta por pagar"
            value={`${formatMoney(pendingUsdValue)} USD`}
            sub={
              pendingUsdValue > 0.01 && defaultRate
                ? `≈ ${formatMoney(batch.pendingBs ?? 0)} Bs. a ${formatMoney(defaultRate.amountBs)}`
                : undefined
            }
            tone={pendingUsdValue > 0.01 ? 'warning' : 'success'}
          />
          <SummaryTile
            label="Retención ISLR"
            value={
              appliesRetention
                ? `${formatMoney(batch.settledRetentionBs ?? 0)} Bs.`
                : 'No aplica'
            }
            sub={appliesRetention ? 'retenida hasta ahora' : undefined}
          />
        </div>

        <Can permission={PERMISSIONS.ACCOUNTS_PAYABLE.UPDATE}>
          <div className="mt-4 pt-4 border-t grid gap-4 sm:grid-cols-2 items-start">
            <FormSwitch
              label="Aplicar retención de ISLR"
              description={
                payments.length > 0
                  ? 'Con pagos registrados no se puede cambiar.'
                  : appliesRetention
                    ? 'Cada pago retiene su parte y genera su obligación SENIAT.'
                    : 'El proveedor recibe el bruto completo.'
              }
              checked={appliesRetention}
              onCheckedChange={onSetRetention}
              disabled={payments.length > 0 || busy}
            />
            {appliesRetention ? (
              <TaxUnitSelect
                label="Unidad Tributaria"
                placeholder="UT vigente"
                selectedId={batch.taxUnitId ?? null}
                selectedFallback={batch.taxUnit ?? null}
                onSelect={(ut) => onSetTaxUnit(ut.id)}
                disabled={busy}
              />
            ) : null}
          </div>
        </Can>
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
              <span className="font-mono font-medium">N° {orderInternalNumber(o)}</span>
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

      {/* Pagos registrados */}
      <FormSection
        title={`Pagos registrados (${payments.length})`}
        description="Cada pago lleva su tasa, su retención de ISLR y su obligación con el SENIAT."
      >
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sin pagos registrados.</p>
        ) : (
          <ul className="divide-y">
            {payments.map((s) => (
              <PaymentRow
                key={s.id}
                settlement={s}
                onEdit={() => startEdit(s.id)}
                onDelete={() => setConfirmPaymentDelete(s.id)}
                busy={busy}
                editing={editingId === s.id}
              />
            ))}
          </ul>
        )}
      </FormSection>

      {/* Registrar / editar pago */}
      {showForm ? (
        <div id="ap-payment-form">
          <FormSection
            title={editingId ? 'Editar pago' : 'Registrar pago'}
            description={
              appliesRetention
                ? 'Indica cuántos USD del lote paga y a qué tasa; el monto a transferir ya descuenta la retención de ISLR.'
                : 'Indica cuántos USD del lote paga y a qué tasa.'
            }
          >
            {ratesForSelect.length === 0 ? (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                No hay tasas USD/Bs cargadas; no se puede registrar el pago.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Datos del movimiento */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={draft.type}
                      onValueChange={(v) =>
                        patch({
                          type: v as OrderPaymentType,
                          bankCode: '',
                          accountNumber: '',
                          recipientMethodId: '',
                        })
                      }
                      disabled={busy}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PAYMENT_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha</Label>
                    <DatePicker
                      value={draft.date}
                      onChange={(v) => patch({ date: v ?? todayIso })}
                      disabled={busy}
                    />
                  </div>
                  {needsBank && methodsForType.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta del proveedor</Label>
                      <Select
                        value={draft.recipientMethodId || '__manual__'}
                        onValueChange={(v) => {
                          if (v === '__manual__') {
                            patch({ recipientMethodId: '', bankCode: '' });
                            return;
                          }
                          const m = methodsForType.find((x) => x.id === v);
                          patch({
                            recipientMethodId: v,
                            bankCode: m?.bankCode ?? '',
                            accountNumber: m?.accountNumber ?? '',
                          });
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecciona una cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {methodsForType.map((m) => (
                            <SelectItem key={m.id} value={m.id as string}>
                              {recipientMethodLabel(m, banks)}
                            </SelectItem>
                          ))}
                          <SelectItem value="__manual__">Otra cuenta (manual)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {needsBank ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Banco</Label>
                      <Select
                        value={draft.bankCode || ''}
                        onValueChange={(v) => patch({ bankCode: v })}
                        disabled={busy || !!draft.recipientMethodId}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecciona banco" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankOptions.map((b) => (
                            <SelectItem key={b.code} value={b.code}>
                              {b.code} · {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {needsRef ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Referencia</Label>
                      <Input
                        className="h-9"
                        value={draft.referenceNumber}
                        onChange={(e) => patch({ referenceNumber: e.target.value })}
                        maxLength={20}
                        disabled={busy}
                      />
                    </div>
                  ) : null}
                  {draft.type === 'other' ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta / detalle (opcional)</Label>
                      <Input
                        className="h-9"
                        value={draft.accountNumber}
                        onChange={(e) => patch({ accountNumber: e.target.value })}
                        maxLength={40}
                        disabled={busy}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Cuánto del lote paga y a qué tasa */}
                <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="ap-covered-usd">
                      USD del lote que paga
                    </Label>
                    <CurrencyAmountInput
                      id="ap-covered-usd"
                      currencyPrefix="$ "
                      value={draft.coveredUsd ?? availableUsd}
                      onChange={(v) => patch({ coveredUsd: v })}
                      disabled={busy}
                      invalid={!coveredValid}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Saldo: {formatMoney(availableUsd)} USD
                      {coveredUsd < availableUsd - 0.01 ? (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="text-brand-blue hover:underline"
                            onClick={() => patch({ coveredUsd: availableUsd })}
                          >
                            pagar todo
                          </button>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <UsdRateSelect
                    rates={ratesForSelect}
                    selectedId={rateId ?? ''}
                    currentRateId={currentRateId}
                    onSelect={(v) => patch({ rateId: v })}
                    disabled={busy}
                    label="Tasa del pago (USD/Bs)"
                  />
                </div>

                {/* Resultado */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3 font-mono">
                    <span className="text-muted-foreground">
                      Bruto · {formatMoney(coveredUsd)} USD × {formatMoney(rateBs)}
                    </span>
                    <span>{formatMoney(grossBs)} Bs.</span>
                  </div>
                  {appliesRetention ? (
                    <div className="flex justify-between gap-3 font-mono items-start">
                      <span className="text-muted-foreground">
                        − Retención ISLR
                        {draft.customOn ? (
                          <> (manual)</>
                        ) : slice ? (
                          <>
                            {' '}
                            · {(slice.taxRate * 100).toFixed(0)}%
                            {!isLegal && slice.subtrahendBs > 0
                              ? ` − sustraendo ${formatMoney(slice.subtrahendBs)}`
                              : ''}
                            {slice.belowThreshold ? ' · bajo el mínimo' : ''}
                          </>
                        ) : null}
                        {!draft.customOn ? (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="text-brand-blue hover:underline"
                              onClick={() =>
                                patch({ customOn: true, customRetentionBs: autoRetentionBs })
                              }
                              disabled={busy}
                            >
                              ajustar
                            </button>
                          </>
                        ) : null}
                      </span>
                      {draft.customOn ? (
                        <div className="flex items-center gap-2">
                          <CurrencyAmountInput
                            className="h-8 w-36 text-right"
                            value={draft.customRetentionBs}
                            onChange={(v) => patch({ customRetentionBs: v })}
                            disabled={busy}
                            invalid={draft.customRetentionBs === undefined}
                          />
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:underline"
                            onClick={() =>
                              patch({ customOn: false, customRetentionBs: undefined })
                            }
                            title={`Volver al cálculo: ${formatMoney(autoRetentionBs)} Bs.`}
                          >
                            auto
                          </button>
                        </div>
                      ) : (
                        <span>{formatMoney(retentionBs)} Bs.</span>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 font-mono font-semibold border-t pt-2 text-success-strong">
                    <span>Monto a transferir</span>
                    <span>
                      {currency === 'BS'
                        ? `${formatMoney(netBs)} Bs.`
                        : `${formatMoney(amount)} ${currency} (= ${formatMoney(netBs)} Bs.)`}
                    </span>
                  </div>
                  {appliesRetention && slice && !isLegal ? (
                    <p className="text-[11px] text-muted-foreground">
                      Sustraendo y mínimo no sujeto ({formatMoney(slice.thresholdBs)} Bs.) se
                      calculan sobre el lote completo y se prorratean por la porción pagada
                      ({(slice.share * 100).toFixed(1)}%). UT {formatMoney(taxUnitBs)} Bs.
                    </p>
                  ) : null}
                  {currency === 'EUR' && !(eurBs > 0) ? (
                    <p className="text-xs text-destructive">No hay tasa EUR/Bs cargada.</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {editingId ? (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar edición
                    </Button>
                  ) : null}
                  <Button type="button" onClick={onSubmit} disabled={busy || !canSubmit}>
                    {busy
                      ? 'Guardando…'
                      : editingId
                        ? 'Guardar pago'
                        : coveredUsd >= availableUsd - 0.01
                          ? 'Registrar pago'
                          : 'Registrar pago parcial'}
                  </Button>
                </div>
              </div>
            )}
          </FormSection>
        </div>
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
                  Se borrarán sus pagos y las órdenes volverán a Pendientes. No se
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
                  Se borrará el pago y su retención con el SENIAT, y el lote volverá a
                  deber esos USD.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmPaymentDelete && onDeletePayment(confirmPaymentDelete)}
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

/** Etiqueta de una cuenta registrada del proveedor. */
function recipientMethodLabel(m: RecipientPaymentMethod, banks: Bank[]): string {
  const bankName = m.bankCode
    ? (banks.find((b) => b.code === m.bankCode)?.name ?? m.bankCode)
    : null;
  if (m.type === 'mobile_payment') {
    return [bankName, m.phoneNumber].filter(Boolean).join(' · ') || 'Pago móvil';
  }
  if (m.type === 'bank_transfer') {
    const acct = m.accountNumber ? `…${String(m.accountNumber).slice(-4)}` : null;
    return [bankName, acct].filter(Boolean).join(' · ') || 'Transferencia';
  }
  return m.description?.trim() || 'Otra cuenta';
}

/** Fila de un pago: movimiento, USD cubiertos, tasa, retención y neto. */
function PaymentRow({
  settlement: s,
  onEdit,
  onDelete,
  busy,
  editing,
}: {
  settlement: AccountsPayableSettlement;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
  editing: boolean;
}) {
  const p = s.payments?.[0];
  const rateBs = settlementRateBs(s);
  return (
    <li
      className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${
        editing ? 'bg-brand-blue/5 -mx-2 px-2 rounded-md' : ''
      }`}
    >
      <div className="flex-1 min-w-0 text-sm space-y-0.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium">
            {p ? PAYMENT_TYPE_LABEL[p.type] : 'Pago'} · {formatDateOnly(s.settlementDate)}
          </span>
          {p?.referenceNumber ? (
            <span className="text-xs text-muted-foreground">Ref. {p.referenceNumber}</span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {formatMoney(s.coveredUsd)} USD × {formatMoney(rateBs)} = {formatMoney(s.grossBs)}{' '}
          Bs. − retención {formatMoney(s.retentionBs)} Bs.
          {s.isCustomRetention ? ' (manual)' : ''}
        </div>
      </div>
      <div className="text-right font-mono text-sm shrink-0">
        <div className="font-semibold">{formatMoney(s.netBs)} Bs.</div>
        {p && p.amountCurrency !== 'BS' ? (
          <div className="text-xs text-muted-foreground">
            {formatMoney(p.amountValue)} {p.amountCurrency}
          </div>
        ) : null}
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
            title="Editar pago"
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
            title="Eliminar pago"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Can>
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
  sub,
  tone,
}: {
  label: string;
  value: string;
  /** Línea secundaria bajo el valor. */
  sub?: string;
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
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
