import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Stepper, type StepDef } from '@/components/ui/stepper';
import { Badge } from '@/components/ui/badge';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AlertTriangle, Building, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { casheaCommissionCents } from '@/lib/money/cashea';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import {
  getLastBranchId,
  getUserBranches,
  setLastBranchId,
} from '@/lib/auth/branches';
import type { OrderType } from '../../domain/models/order';
import { ORDER_TYPE_LABEL } from '../../domain/models/order';
import type { OrderValues } from '@/lib/validations/schemas';
import type { Patient } from '@/modules/patients/domain/models/patient';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Pathology } from '@/modules/pathologies/domain/models/pathology';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { serviceTypeGateway } from '@/modules/service-types/infrastructure/serviceTypeGateway';
import { pathologyGateway } from '@/modules/pathologies/infrastructure/pathologyGateway';
import { specialtyGateway } from '@/modules/specialties/infrastructure/specialtyGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import { appConfigGateway } from '@/modules/app-config/infrastructure/appConfigGateway';
import { PatientSearchSelect } from './PatientSearchSelect';
import { PatientCreateModal } from './PatientCreateModal';
import { AuthorizeAmountModal } from './AuthorizeAmountModal';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { PatientAvailableInsurance } from '@/modules/patients/domain/models/patient';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import type { ProviderSelectValue } from './ProviderSearchSelect';
import { ServiceProviderTable } from './ServiceProviderTable';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import {
  OrderPaymentForm,
  INCOMING_PAYMENT_TYPES,
  paymentInUsd,
  type PaymentItemErrors,
} from './OrderPaymentForm';
import type { Order } from '../../domain/models/order';
import { OrderAttendStep } from './stages/OrderAttendStep';
import { OrderReportStep } from './stages/OrderReportStep';
import { OrderBillingStep } from './stages/OrderBillingStep';

const NO_STAGE_PERM = 'No tenés permiso para este paso';

function buildOrderSteps(
  savedOrderId: boolean,
  perms: { attention: boolean; report: boolean; billing: boolean },
  status?: import('../../domain/models/order').OrderStatus,
): StepDef[] {
  const isAttendedOrLater =
    status === 'attended' || status === 'report_issued' || status === 'finalized';
  const isReportedOrLater = status === 'report_issued' || status === 'finalized';
  return [
    {
      id: 'register',
      label: '1. Creación de orden',
      description: 'Datos de la orden',
      available: true,
    },
    {
      id: 'attention',
      label: '2. Atención del paciente',
      description: 'Descargar e imprimir órdenes internas',
      available: savedOrderId && perms.attention,
      lockedReason: !perms.attention ? NO_STAGE_PERM : 'Guardá la orden primero',
    },
    {
      id: 'report',
      label: '3. Informe médico y estudios',
      description: 'Estudios y observaciones',
      available: savedOrderId && isAttendedOrLater && perms.report,
      lockedReason: !perms.report ? NO_STAGE_PERM : 'Confirmá las órdenes internas primero',
    },
    {
      id: 'billing',
      label: '4. Facturación y liquidación',
      description: 'Cierre, factura y liquidación',
      available: savedOrderId && isReportedOrLater && perms.billing,
      lockedReason: !perms.billing ? NO_STAGE_PERM : 'Emití el informe primero',
    },
  ];
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  );
}

function RequiredLabel({
  required,
  children,
  htmlFor,
}: {
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
      {required ? <span className="text-destructive ml-0.5">*</span> : null}
    </Label>
  );
}

export type OrderFormState = {
  holder: Patient | null;
  patient: Patient | null;
  provider: ProviderSelectValue | null;
};

export type OrderFormProps = {
  initialHolder?: Patient | null;
  initialPatient?: Patient | null;
  initialProvider?: ProviderSelectValue | null;
  /** Orden ya persistida (modo edición). Habilita pasos 2-4. */
  savedOrder?: Order | null;
  /** Paso actual del wizard (controlado por la página padre). */
  currentStep?: string;
  onStepChange?: (id: string) => void;
  /** Refresca la orden persistida tras transiciones (atender, informe, facturar). */
  onOrderRefresh?: () => void | Promise<void>;
};

export function OrderForm({
  initialHolder = null,
  initialPatient = null,
  initialProvider = null,
  savedOrder = null,
  currentStep: externalStep,
  onStepChange,
  onOrderRefresh,
}: OrderFormProps) {
  const me = useAuthStore((s) => s.user);
  const { has } = usePermissions();
  const canEditAmount = has(PERMISSIONS.ORDERS.EDIT_AMOUNT);
  const canAttention = has(PERMISSIONS.ORDERS.STAGE_ATTENTION);
  const canReport = has(PERMISSIONS.ORDERS.STAGE_REPORT);
  const canBilling = has(PERMISSIONS.ORDERS.STAGE_BILLING);
  const { control, setValue, formState } = useFormContext<OrderValues>();
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const [internalStep, setInternalStep] = useState<string>('register');
  const currentStep = externalStep ?? internalStep;
  const setCurrentStep = (id: string) => {
    if (onStepChange) onStepChange(id);
    else setInternalStep(id);
  };
  const [holder, setHolder] = useState<Patient | null>(initialHolder);
  const [patient, setPatient] = useState<Patient | null>(initialPatient);
  const [sameAsHolder, setSameAsHolder] = useState(
    initialHolder && initialPatient ? initialHolder.id === initialPatient.id : true,
  );
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<'holder' | 'patient' | null>(null);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [confirmTypeChange, setConfirmTypeChange] = useState<OrderType | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [pathologiesLoading, setPathologiesLoading] = useState(true);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  void initialProvider;

  // Hidrata el ServiceProviderTable: map de proveedores ya elegidos en la orden.
  const initialProvidersMap = useMemo(() => {
    const m = new Map<string, Doctor | CareCenter>();
    for (const ost of savedOrder?.orderServiceTypes ?? []) {
      if (ost.providerType === 'doctor' && ost.doctor && ost.doctorId) {
        m.set(`doctor:${ost.doctorId}`, ost.doctor as unknown as Doctor);
      } else if (ost.providerType === 'care_center' && ost.careCenter && ost.careCenterId) {
        m.set(`care_center:${ost.careCenterId}`, ost.careCenter as unknown as CareCenter);
      }
    }
    return m;
  }, [savedOrder]);

  const userBranches = useMemo(() => getUserBranches(me), [me]);
  const branchId = useWatch({ control, name: 'branchId' });
  const type = useWatch({ control, name: 'type' });
  const payments = (useWatch({ control, name: 'payments' }) ?? []) as OrderValues['payments'];

  // Branch default: last used or first.
  useEffect(() => {
    if (branchId) return;
    if (!me || userBranches.length === 0) return;
    const last = getLastBranchId(me.id);
    const candidate = last && userBranches.find((b) => b.id === last) ? last : userBranches[0].id;
    setValue('branchId', candidate, { shouldValidate: false });
  }, [me, userBranches, branchId, setValue]);

  useEffect(() => {
    if (me && branchId) setLastBranchId(me.id, branchId);
  }, [me, branchId]);

  useEffect(() => {
    serviceTypeGateway.listAssignable().then(setServiceTypes).catch(() => setServiceTypes([]));
    pathologyGateway
      .listAssignable()
      .then(setPathologies)
      .catch(() => setPathologies([]))
      .finally(() => setPathologiesLoading(false));
    specialtyGateway.listAssignable().then(setSpecialties).catch(() => setSpecialties([]));
  }, []);

  // Plataforma USD-only: monto en USD; tasa USD/Bs usada solo para convertir
  // pagos en BS/EUR (vía rate snapshot del propio pago).
  useEffect(() => {
    let cancelled = false;
    exchangeRateGateway
      .getCurrent('USD')
      .then((r) => !cancelled && setCurrentRate(r))
      .catch(() => !cancelled && setCurrentRate(null));
    return () => {
      cancelled = true;
    };
  }, []);

  // Lista USD para selector "Tasa fija" en órdenes seguro.
  const [usdRates, setUsdRates] = useState<ExchangeRate[]>([]);
  useEffect(() => {
    exchangeRateGateway
      .list({
        limit: 100,
        currency: 'USD',
        sortBy: 'effectiveDate',
        sortDir: 'DESC',
      })
      .then((res) => setUsdRates(res.data))
      .catch(() => setUsdRates([]));
  }, []);

  // Cache EUR rates por id (necesarias para convertir cash_eur → USD).
  const [eurRatesById, setEurRatesById] = useState<Record<string, ExchangeRate>>({});
  const lookupRate = (id: string): ExchangeRate | null =>
    eurRatesById[id] ??
    (currentRate && currentRate.id === id ? currentRate : null);

  // Holder/patient sync
  const onHolderChange = (next: Patient | null) => {
    setHolder(next);
    setValue('holderId', next?.id ?? '', { shouldValidate: true, shouldDirty: true });
    setValue('contractorId', '', { shouldDirty: true });
    setValue('insuranceId', '', { shouldDirty: true });
    setValue('insuranceSource', '', { shouldDirty: true });
    if (sameAsHolder) {
      setPatient(next);
      setValue('patientId', next?.id ?? '', { shouldValidate: true, shouldDirty: true });
    }
  };
  const onPatientChange = (next: Patient | null) => {
    setPatient(next);
    setValue('patientId', next?.id ?? '', { shouldValidate: true, shouldDirty: true });
  };
  const toggleSameAsHolder = (v: boolean) => {
    setSameAsHolder(v);
    if (v) {
      setPatient(holder);
      setValue('patientId', holder?.id ?? '', { shouldValidate: true, shouldDirty: true });
    }
  };

  // Order type change
  const requestTypeChange = (next: OrderType) => {
    if (next === type) return;
    if (holder || patient) {
      setConfirmTypeChange(next);
    } else {
      setValue('type', next, { shouldValidate: true, shouldDirty: true });
    }
  };
  const confirmTypeChangeApply = () => {
    if (!confirmTypeChange) return;
    setValue('type', confirmTypeChange, { shouldValidate: true, shouldDirty: true });
    setHolder(null);
    setPatient(null);
    setSameAsHolder(true);
    setValue('holderId', '', { shouldDirty: true });
    setValue('patientId', '', { shouldDirty: true });
    setValue('contractorId', '', { shouldDirty: true });
    setValue('insuranceId', '', { shouldDirty: true });
    setValue('insuranceSource', '', { shouldDirty: true });
    setConfirmTypeChange(null);
  };

  // Seguros disponibles del titular: directo + vía contratista.
  // Load desde BE para tener single source of truth (vs. derivar de holder.contractors).
  const [availableInsurances, setAvailableInsurances] = useState<
    PatientAvailableInsurance[]
  >([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  useEffect(() => {
    if (!holder || type !== 'insurance') {
      setAvailableInsurances([]);
      return;
    }
    let cancelled = false;
    setLoadingAvailable(true);
    patientGateway
      .getAvailableInsurances(holder.id)
      .then((list) => {
        if (!cancelled) setAvailableInsurances(list);
      })
      .catch(() => !cancelled && setAvailableInsurances([]))
      .finally(() => !cancelled && setLoadingAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [holder, type]);

  // Composite key para el Select combinado.
  const buildOptionKey = (opt: PatientAvailableInsurance): string =>
    `${opt.source}|${opt.insurance.id}|${opt.contractor?.id ?? ''}`;
  const currentContractorId = useWatch({ control, name: 'contractorId' }) as
    | string
    | ''
    | undefined;
  const currentInsuranceId = useWatch({ control, name: 'insuranceId' }) as
    | string
    | ''
    | undefined;
  const currentInsuranceSource = useWatch({ control, name: 'insuranceSource' }) as
    | 'direct'
    | 'via_contractor'
    | ''
    | undefined;
  const currentOptionKey: string =
    currentInsuranceId && currentInsuranceSource
      ? `${currentInsuranceSource}|${currentInsuranceId}|${currentContractorId ?? ''}`
      : '';

  const branchSelect = (() => {
    if (userBranches.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          No tenés sucursales asignadas. Solicitá acceso a un administrador.
        </p>
      );
    }
    if (userBranches.length === 1) {
      return (
        <Input readOnly value={userBranches[0].name} className="h-9 bg-muted/30" />
      );
    }
    return (
      <Select
        value={branchId || ''}
        onValueChange={(v) => setValue('branchId', v, { shouldDirty: true, shouldValidate: true })}
      >
        <SelectTrigger className={cn('h-9', errors.branchId?.message && 'border-destructive')}>
          <SelectValue placeholder="Seleccioná sucursal" />
        </SelectTrigger>
        <SelectContent>
          {userBranches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  })();

  // Payments totals (USD).
  const totalPaid = useMemo(() => {
    if (!payments) return 0;
    return payments.reduce(
      (acc, p) => acc + paymentInUsd(p, currentRate, lookupRate),
      0,
    );
  }, [payments, currentRate, eurRatesById]);

  const priceAmount = useWatch({ control, name: 'priceAmount' }) as number | undefined;
  const diff = (priceAmount ?? 0) - totalPaid;

  const showPayments = type === 'cash';
  const isCashea = type === 'cashea';

  // Tasa fija — solo aplica a seguro. Limpia campos cuando type cambia fuera de insurance.
  const useFixedRateVal = useWatch({ control, name: 'useFixedRate' }) as
    | boolean
    | undefined;
  const fixedExchangeRateIdVal = useWatch({
    control,
    name: 'fixedExchangeRateId',
  }) as string | '' | undefined;
  useEffect(() => {
    if (type !== 'insurance') {
      if (useFixedRateVal)
        setValue('useFixedRate', false, { shouldDirty: true, shouldValidate: true });
      if (fixedExchangeRateIdVal)
        setValue('fixedExchangeRateId', '', { shouldDirty: true });
      return;
    }
    // Auto-seleccionar la tasa más reciente cuando se activa el checkbox sin tasa.
    if (useFixedRateVal && !fixedExchangeRateIdVal && usdRates.length > 0) {
      setValue('fixedExchangeRateId', usdRates[0].id, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [type, useFixedRateVal, fixedExchangeRateIdVal, usdRates, setValue]);
  const fixedRateObj = useMemo(
    () =>
      fixedExchangeRateIdVal
        ? usdRates.find((r) => r.id === fixedExchangeRateIdVal) ?? null
        : null,
    [fixedExchangeRateIdVal, usdRates],
  );

  // Comisión Cashea (dos tramos): tasas snapshot si la orden ya tiene snapshot,
  // sino la config global cargada on-demand. El monto de la primera cuota es un
  // campo del form (editable en borrador).
  const casheaFirstInstallmentAmount = useWatch({
    control,
    name: 'casheaFirstInstallmentAmount',
  }) as number | undefined;
  const [globalCasheaConfig, setGlobalCasheaConfig] = useState<{
    firstInstallmentRate: number;
    totalRate: number;
  } | null>(null);
  useEffect(() => {
    if (!isCashea) return;
    // Sólo necesitamos la config global cuando la orden aún no tiene snapshot.
    if (savedOrder?.casheaTotalRate != null) return;
    let cancelled = false;
    appConfigGateway
      .getCasheaCommission()
      .then(
        (cfg) =>
          !cancelled &&
          setGlobalCasheaConfig({
            firstInstallmentRate: cfg.firstInstallmentRate,
            totalRate: cfg.totalRate,
          }),
      )
      .catch(() => !cancelled && setGlobalCasheaConfig(null));
    return () => {
      cancelled = true;
    };
  }, [isCashea, savedOrder]);
  const casheaFirstRate = isCashea
    ? savedOrder?.casheaFirstInstallmentRate != null
      ? Number(savedOrder.casheaFirstInstallmentRate)
      : globalCasheaConfig?.firstInstallmentRate ?? 0.04
    : 0;
  const casheaTotalRate = isCashea
    ? savedOrder?.casheaTotalRate != null
      ? Number(savedOrder.casheaTotalRate)
      : globalCasheaConfig?.totalRate ?? 0.06
    : 0;
  const casheaFirstAmount = isCashea ? casheaFirstInstallmentAmount ?? 0 : 0;
  // Comisión exacta en centavos enteros (espeja el backend) → sin drift toFixed.
  const casheaCommissionAmount = isCashea
    ? casheaCommissionCents(
        casheaFirstAmount,
        priceAmount ?? 0,
        casheaFirstRate,
        casheaTotalRate,
      ) / 100
    : 0;
  const casheaNet = isCashea
    ? (Math.round((priceAmount ?? 0) * 100) -
        Math.round(casheaCommissionAmount * 100)) /
      100
    : 0;
  const casheaFirstRatePct = +(casheaFirstRate * 100).toFixed(2);
  const casheaTotalRatePct = +(casheaTotalRate * 100).toFixed(2);

  // Price breakdown derived from selected service types + insurance/Particular.
  const orderServiceTypeRows = (useWatch({ control, name: 'serviceTypes' }) ?? []) as Array<{
    serviceTypeId: string;
    providerType: 'doctor' | 'care_center';
    doctorId?: string;
    careCenterId?: string;
    quantity?: number;
  }>;
  const serviceTypeIds = orderServiceTypeRows.map((r) => r.serviceTypeId).filter(Boolean);
  // Cantidad por ST (sólo > 1 si el ST permite cantidad). Default 1.
  const qtyByST = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of orderServiceTypeRows) {
      if (r.serviceTypeId) m.set(r.serviceTypeId, Math.max(1, Math.trunc(r.quantity ?? 1)));
    }
    return m;
  }, [orderServiceTypeRows]);
  const insuranceId = useWatch({ control, name: 'insuranceId' }) as string | '' | undefined;
  const isInsuranceOrder = type === 'insurance';

  // Carga los servicePrices del seguro elegido (kind: 'insurance').
  // Particular se lee directo de `serviceTypes[].particularPrice*`.
  const [insuranceServicePrices, setInsuranceServicePrices] = useState<
    ServicePriceRow[]
  >([]);
  useEffect(() => {
    if (!isInsuranceOrder || !insuranceId) {
      setInsuranceServicePrices([]);
      return;
    }
    let cancelled = false;
    insuranceGateway
      .getById(insuranceId)
      .then((ins) => {
        if (!cancelled) setInsuranceServicePrices(ins.servicePrices ?? []);
      })
      .catch(() => !cancelled && setInsuranceServicePrices([]));
    return () => {
      cancelled = true;
    };
  }, [isInsuranceOrder, insuranceId]);

  type PriceLine = {
    id: string;
    name: string;
    /** Cantidad del ST (≥1). */
    qty: number;
    /** Precio unitario USD, o null si no hay precio definido. */
    unit: number | null;
    /** unit × qty, o null si no hay precio definido. */
    amount: number | null;
  };

  const priceLines: PriceLine[] = useMemo(() => {
    const ispByST = new Map(
      insuranceServicePrices.map((r) => [r.serviceTypeId, r]),
    );
    return serviceTypeIds.map((id) => {
      const st = serviceTypes.find((s) => s.id === id);
      const qty = qtyByST.get(id) ?? 1;
      if (!st) return { id, name: '—', qty, unit: null, amount: null };
      const raw = isInsuranceOrder
        ? ispByST.get(id)?.priceUsd
        : st.particularPriceUsd;
      const num = raw === null || raw === undefined ? null : Number(raw);
      const unit = num !== null && Number.isFinite(num) && num > 0 ? num : null;
      return {
        id,
        name: st.name,
        qty,
        unit,
        amount: unit !== null ? +(unit * qty).toFixed(2) : null,
      };
    });
  }, [serviceTypeIds, serviceTypes, insuranceServicePrices, isInsuranceOrder, qtyByST]);

  const computedPriceSum = useMemo(
    () => priceLines.reduce((acc, l) => acc + (l.amount ?? 0), 0),
    [priceLines],
  );
  const hasMissingPrices = priceLines.some((l) => l.amount === null);

  // Auto-set priceAmount when selección/moneda cambian.
  // Insurance: locked → siempre sincroniza con la suma calculada (ignora input manual).
  // Cash/credit/cashea: overwrite cuando cambian inputs — el usuario puede editar luego.
  const lastAppliedSumRef = useRef<number | null>(null);
  // Monto bloqueado: seguro (siempre) o sin permiso orders.edit-amount.
  const amountLocked = isInsuranceOrder || !canEditAmount;
  // Monto ya autorizado por un validador — no auto-sincronizar (preserva el
  // monto autorizado en vez de pisarlo con la suma Particular).
  const hasAuthorization = !!savedOrder?.amountAuthorizedById;
  useEffect(() => {
    if (priceLines.length === 0) return;
    if (hasAuthorization) {
      lastAppliedSumRef.current = priceAmount ?? null;
      return;
    }
    const rounded = +computedPriceSum.toFixed(2);
    const current = priceAmount ?? 0;
    if (amountLocked) {
      if (rounded !== current) {
        setValue('priceAmount', rounded, { shouldDirty: true, shouldValidate: true });
      }
      lastAppliedSumRef.current = rounded;
      return;
    }
    // No-insurance: respetar edición manual posterior al último auto-set.
    const userEdited =
      lastAppliedSumRef.current !== null &&
      Math.abs(current - lastAppliedSumRef.current) > 0.001;
    if (userEdited) {
      lastAppliedSumRef.current = rounded; // resync baseline so next change re-applies
      return;
    }
    if (rounded !== current) {
      setValue('priceAmount', rounded, { shouldDirty: true, shouldValidate: true });
    }
    lastAppliedSumRef.current = rounded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedPriceSum, amountLocked, hasAuthorization, insuranceId, serviceTypeIds.join(',')]);

  const orderSteps = buildOrderSteps(
    !!savedOrder,
    { attention: canAttention, report: canReport, billing: canBilling },
    savedOrder?.status,
  );
  const renderStep1 = currentStep === 'register';

  return (
    <>
      <Stepper steps={orderSteps} current={currentStep} onSelect={setCurrentStep} />

      {!renderStep1 && currentStep === 'attention' && savedOrder ? (
        <OrderAttendStep
          order={savedOrder}
          onSaved={() => onOrderRefresh?.()}
          onAdvance={canReport ? () => setCurrentStep('report') : undefined}
        />
      ) : null}

      {!renderStep1 && currentStep === 'report' && savedOrder ? (
        <OrderReportStep
          key={savedOrder.id}
          order={savedOrder}
          onSaved={() => onOrderRefresh?.()}
          onAdvance={canBilling ? () => setCurrentStep('billing') : undefined}
        />
      ) : null}

      {!renderStep1 && currentStep === 'billing' && savedOrder ? (
        <OrderBillingStep
          order={savedOrder}
          onSaved={() => onOrderRefresh?.()}
        />
      ) : null}

      {!renderStep1 ? null : (
      <>
      <FormSection
        title="Sucursal y tipo de orden"
        description="Sucursal donde se emite la orden y su modalidad."
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <RequiredLabel required>
              <Building className="w-4 h-4 inline mr-1.5 text-muted-foreground" />
              Sucursal
            </RequiredLabel>
            {branchSelect}
            <FieldError message={errors.branchId?.message} />
          </div>

          <div className="space-y-2">
            <RequiredLabel required>Tipo de orden</RequiredLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['cash', 'credit', 'insurance', 'cashea'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => requestTypeChange(t)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                    type === t
                      ? 'border-brand-blue bg-brand-blue-soft'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {ORDER_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <FieldError message={errors.type?.message} />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Titular y paciente"
        description="El titular es quien financia la orden; el paciente puede ser el mismo o un tercero."
        allowOverflow
      >
        <div className="space-y-4">
          {type === 'insurance' ? (
            <div className="rounded-md border border-dashed bg-brand-blue-soft/40 px-3 py-2 text-xs text-brand-blue-strong flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Solo se listan pacientes con al menos un seguro asignado (directo o vía contratista).
            </div>
          ) : null}
          <PatientSearchSelect
            label="Titular"
            value={holder}
            onChange={onHolderChange}
            required
            error={errors.holderId?.message}
            hasInsuranceAndContractor={type === 'insurance'}
            onCreateClick={() => {
              setCreateTarget('holder');
              setCreatePatientOpen(true);
            }}
          />

          <div className="flex items-center gap-2">
            <input
              id="sameAsHolder"
              type="checkbox"
              checked={sameAsHolder}
              onChange={(e) => toggleSameAsHolder(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="sameAsHolder" className="text-sm">
              El paciente es el mismo titular
            </Label>
          </div>

          {!sameAsHolder ? (
            <PatientSearchSelect
              label="Paciente"
              value={patient}
              onChange={onPatientChange}
              required
              error={errors.patientId?.message}
              onCreateClick={() => {
                setCreateTarget('patient');
                setCreatePatientOpen(true);
              }}
            />
          ) : null}

          {type === 'insurance' ? (
            <div className="space-y-1.5">
              <RequiredLabel required>Seguro del titular</RequiredLabel>
              <Select
                value={currentOptionKey}
                onValueChange={(key) => {
                  if (!key) {
                    setValue('insuranceId', '', { shouldDirty: true, shouldValidate: true });
                    setValue('insuranceSource', '', { shouldDirty: true, shouldValidate: true });
                    setValue('contractorId', '', { shouldDirty: true });
                    return;
                  }
                  const [src, insId, ctrId] = key.split('|');
                  setValue('insuranceId', insId, { shouldDirty: true, shouldValidate: true });
                  setValue(
                    'insuranceSource',
                    (src as 'direct' | 'via_contractor'),
                    { shouldDirty: true, shouldValidate: true },
                  );
                  setValue('contractorId', ctrId || '', {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                disabled={!holder || loadingAvailable || availableInsurances.length === 0}
              >
                <SelectTrigger
                  className={cn(
                    'h-9',
                    (errors.insuranceId?.message || errors.insuranceSource?.message) &&
                      'border-destructive',
                  )}
                >
                  <SelectValue
                    placeholder={
                      !holder
                        ? 'Seleccioná un titular primero'
                        : loadingAvailable
                          ? 'Cargando seguros…'
                          : availableInsurances.length === 0
                            ? 'Titular sin seguros disponibles'
                            : 'Seleccioná un seguro'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableInsurances.map((opt) => {
                    const k = buildOptionKey(opt);
                    const label =
                      opt.source === 'direct'
                        ? `${opt.insurance.name} (directo)`
                        : `${opt.insurance.name} (vía ${opt.contractor?.name ?? '—'})`;
                    return (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError
                message={
                  errors.insuranceSource?.message ?? errors.insuranceId?.message
                }
              />
              {currentInsuranceSource === 'direct' ? (
                <div className="rounded-md border border-dashed bg-success-soft/40 px-3 py-2 text-xs text-success flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  El paciente asume rol de contratista propio para este seguro
                  directo. La selección de contratista queda bloqueada.
                </div>
              ) : null}
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="serviceKey" className="text-sm font-medium">
                  Clave de servicio{' '}
                  <span className="text-xs text-muted-foreground font-normal">
                    (opcional)
                  </span>
                </Label>
                <Controller
                  control={control}
                  name="serviceKey"
                  render={({ field }) => (
                    <Input
                      id="serviceKey"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      maxLength={30}
                      placeholder="Referencia o autorización del seguro"
                      className={cn(
                        'h-9',
                        errors.serviceKey?.message && 'border-destructive',
                      )}
                    />
                  )}
                />
                <FieldError message={errors.serviceKey?.message} />
              </div>

              <div className="space-y-2 pt-3 border-t border-dashed">
                <div className="flex items-start gap-2">
                  <input
                    id="useFixedRate"
                    type="checkbox"
                    checked={!!useFixedRateVal}
                    onChange={(e) =>
                      setValue('useFixedRate', e.target.checked, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    className="h-4 w-4 mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="useFixedRate" className="text-sm font-medium">
                      Tasa fija para esta orden
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      La cuenta por cobrar del seguro quedará fija en bolívares a
                      la tasa seleccionada. Los cobros se descuentan en Bs sin
                      importar la tasa del día del pago.
                    </p>
                  </div>
                </div>
                {useFixedRateVal ? (
                  <div className="space-y-1.5 pl-6">
                    <RequiredLabel required>Tasa fija USD/Bs</RequiredLabel>
                    <Controller
                      control={control}
                      name="fixedExchangeRateId"
                      render={({ field }) => (
                        <Select
                          value={(field.value as string) || ''}
                          onValueChange={(v) =>
                            field.onChange(v === '__none__' ? '' : v)
                          }
                          disabled={usdRates.length === 0}
                        >
                          <SelectTrigger
                            className={cn(
                              'h-9',
                              errors.fixedExchangeRateId?.message &&
                                'border-destructive',
                            )}
                          >
                            <SelectValue
                              placeholder={
                                usdRates.length === 0
                                  ? 'No hay tasas USD cargadas'
                                  : 'Seleccioná tasa USD/Bs'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {usdRates.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {`Bs. ${formatMoney(r.amountBs)} · ${new Date(
                                  r.effectiveDate,
                                ).toLocaleDateString('es-VE')}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError
                      message={errors.fixedExchangeRateId?.message}
                    />
                    {fixedRateObj && priceAmount ? (
                      <p className="text-[11px] text-muted-foreground">
                        Total a cobrar al seguro:{' '}
                        <span className="font-mono font-semibold text-foreground">
                          {formatMoney(priceAmount * Number(fixedRateObj.amountBs))}{' '}
                          Bs
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="Servicio y proveedores"
        description="Especialidad, patologías y el proveedor que atiende cada tipo de servicio."
        allowOverflow
      >
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel required>Especialidad</RequiredLabel>
            <Controller
              control={control}
              name="specialtyId"
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger
                    className={cn('h-9', errors.specialtyId?.message && 'border-destructive')}
                  >
                    <SelectValue placeholder="Seleccioná especialidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {specialties.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.specialtyId?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Controller
              control={control}
              name="pathologyIds"
              render={({ field }) => {
                const selected: string[] = Array.isArray(field.value) ? field.value : [];
                return (
                  <ChipMultiSelect
                    label="Patologías (opcional)"
                    value={selected}
                    onChange={(next) => field.onChange(next)}
                    options={pathologies.map((p) => ({ id: p.id, label: p.name }))}
                    loading={pathologiesLoading}
                    searchPlaceholder="Buscar patología…"
                    emptyLabel="No hay patologías activas."
                    counterSuffix={{ singular: 'seleccionada', plural: 'seleccionadas' }}
                    error={
                      typeof errors.pathologyIds?.message === 'string'
                        ? errors.pathologyIds.message
                        : undefined
                    }
                  />
                );
              }}
            />
          </div>
        </FormGrid>

        <div className="mt-5 pt-5 border-t border-dashed space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Tipos de servicio y proveedores
          </p>
        </div>
        <div className="mt-3">
        <Controller
          control={control}
          name="serviceTypes"
          render={({ field }) => {
            const rowErrors = (
              errors.serviceTypes as unknown as Array<
                | {
                    serviceTypeId?: { message?: string };
                    providerType?: { message?: string };
                    doctorId?: { message?: string };
                    careCenterId?: { message?: string };
                    quantity?: { message?: string };
                  }
                | undefined
              >
            )?.map?.((e) => ({
              serviceTypeId: e?.serviceTypeId?.message,
              providerType: e?.providerType?.message,
              doctorId: e?.doctorId?.message,
              careCenterId: e?.careCenterId?.message,
              quantity: e?.quantity?.message,
            }));
            return (
              <ServiceProviderTable
                value={(field.value ?? []) as Array<{
                  serviceTypeId: string;
                  providerType: 'doctor' | 'care_center';
                  doctorId?: string;
                  careCenterId?: string;
                  quantity?: number;
                }>}
                onChange={field.onChange}
                serviceTypes={serviceTypes}
                errors={rowErrors}
                initialProviders={initialProvidersMap}
              />
            );
          }}
        />
        {typeof errors.serviceTypes?.message === 'string' && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {errors.serviceTypes.message}
          </p>
        )}
        </div>
      </FormSection>

      <FormSection title="Fechas" description="Fecha de emisión y fecha del servicio.">
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel required>Fecha de la orden</RequiredLabel>
            <Controller
              control={control}
              name="orderDate"
              render={({ field }) => (
                <DatePicker
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? '')}
                  onBlur={field.onBlur}
                  invalid={!!errors.orderDate?.message}
                  disableFuture
                />
              )}
            />
            <FieldError message={errors.orderDate?.message} />
          </div>
          <div className="space-y-1.5">
            <RequiredLabel required>Fecha de atención</RequiredLabel>
            <Controller
              control={control}
              name="appointmentDate"
              render={({ field }) => (
                <DateTimePicker
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? '')}
                  onBlur={field.onBlur}
                  invalid={!!errors.appointmentDate?.message}
                />
              )}
            />
            <FieldError message={errors.appointmentDate?.message} />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Precio"
        description={
          isInsuranceOrder
            ? 'Precio fijo según los precios definidos del seguro para cada tipo de servicio.'
            : canEditAmount
              ? 'Suma de los precios "Particular" de cada tipo de servicio. Editable.'
              : 'Suma de los precios "Particular" de cada tipo de servicio. No tenés permiso para editar el monto.'
        }
      >
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel required>Moneda</RequiredLabel>
            <Input readOnly value="USD" className="h-9 bg-muted/30" />
          </div>
          <div className="space-y-1.5">
            <RequiredLabel required>
              Monto {isInsuranceOrder ? '(fijo)' : ''}
            </RequiredLabel>
            <Controller
              control={control}
              name="priceAmount"
              render={({ field }) => (
                <CurrencyAmountInput
                  value={typeof field.value === 'number' ? field.value : undefined}
                  onChange={(v) => field.onChange(v ?? 0)}
                  currencyPrefix="USD"
                  disabled={isInsuranceOrder || !canEditAmount}
                  className={cn(errors.priceAmount?.message && 'border-destructive')}
                />
              )}
            />
            <FieldError message={errors.priceAmount?.message} />
          </div>
        </FormGrid>

        {!isInsuranceOrder && !canEditAmount && savedOrder?.status === 'draft' ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAuthorizeOpen(true)}
              className="gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              Solicitar autorización de monto
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              No tenés permiso para editar el monto. Un validador con permiso puede
              autorizar e ingresar un nuevo monto.
            </p>
          </div>
        ) : null}

        {savedOrder?.amountAuthorizedById ? (
          <div className="mt-3 rounded-md border border-dashed bg-success-soft/40 px-3 py-2 text-xs text-success flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div>
                Monto autorizado por{' '}
                <span className="font-semibold">
                  {`${savedOrder.amountAuthorizedBy?.firstName ?? ''} ${
                    savedOrder.amountAuthorizedBy?.lastName ?? ''
                  }`.trim() || 'un validador'}
                </span>
                {savedOrder.amountAuthorizedAt
                  ? ` el ${new Date(savedOrder.amountAuthorizedAt).toLocaleString('es-VE')}`
                  : ''}
                .
              </div>
              {savedOrder.amountAuthorizationNote ? (
                <div className="text-muted-foreground">
                  Observación: {savedOrder.amountAuthorizationNote}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {priceLines.length > 0 ? (
          <div className="mt-4 rounded-lg border bg-muted/20">
            <div className="px-3 py-2 border-b text-[11px] uppercase tracking-[0.06em] text-muted-foreground flex items-center justify-between">
              <span>
                Detalle por tipo de servicio · {isInsuranceOrder ? 'Tarifa de seguro' : 'Particular'}
              </span>
              <span>USD</span>
            </div>
            <div className="divide-y">
              {priceLines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between px-3 py-2 text-sm gap-2"
                >
                  <span className="truncate">
                    {l.name}
                    {l.qty > 1 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {l.qty} ×{' '}
                        {l.unit !== null ? formatMoney(l.unit) : '—'}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'font-mono shrink-0',
                      l.amount === null && 'text-warning',
                    )}
                  >
                    {l.amount === null
                      ? 'Sin precio definido'
                      : formatMoney(l.amount)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-muted/40">
                <span>Total</span>
                <span className="font-mono">
                  {formatMoney(computedPriceSum)} USD
                </span>
              </div>
            </div>
            {hasMissingPrices ? (
              <div className="px-3 py-2 text-[11px] text-warning border-t">
                Hay tipos de servicio sin precio definido para esta combinación. Definí los precios
                desde el módulo Tipos de Servicio.
              </div>
            ) : null}
          </div>
        ) : null}
        {isCashea ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5 max-w-xs">
              <RequiredLabel required>Primera cuota (inicial)</RequiredLabel>
              <Controller
                control={control}
                name="casheaFirstInstallmentAmount"
                render={({ field }) => (
                  <CurrencyAmountInput
                    value={typeof field.value === 'number' ? field.value : undefined}
                    onChange={(v) => field.onChange(v ?? 0)}
                    currencyPrefix="USD"
                    disabled={!!savedOrder && savedOrder.status !== 'draft'}
                    className={cn(
                      errors.casheaFirstInstallmentAmount?.message &&
                        'border-destructive',
                    )}
                  />
                )}
              />
              <FieldError message={errors.casheaFirstInstallmentAmount?.message} />
            </div>
            <div className="rounded-lg border border-dashed bg-warning-soft/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Precio
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(priceAmount ?? 0)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Comisión Cashea
                </div>
                <div className="text-sm font-semibold text-destructive">
                  -{formatMoney(casheaCommissionAmount)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {casheaFirstRatePct}% primera cuota + {casheaTotalRatePct}% total
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Monto a recibir por Cashea
                </div>
                <div className="text-base font-bold text-success">
                  {formatMoney(casheaNet)} USD
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {savedOrder?.casheaTotalRate != null
                ? 'Comisión fija — porcentajes snapshot al crear la orden.'
                : 'Porcentajes vigentes al momento de crear la orden. Configurables en Administración → Configuración.'}
            </p>
          </div>
        ) : null}
      </FormSection>

      {showPayments ? (
        <FormSection
          title="Pagos"
          description="Registrá los pagos recibidos. La diferencia con el precio se mostrará abajo."
        >
          <Controller
            control={control}
            name="payments"
            render={({ field }) => {
              const rawPaymentsErrors = errors.payments as unknown;
              const paymentsErrors: PaymentItemErrors[] | undefined = Array.isArray(rawPaymentsErrors)
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
                  payments={field.value ?? []}
                  onChange={(next) => field.onChange(next)}
                  usdRate={currentRate}
                  onEurRateLoaded={(r) =>
                    setEurRatesById((prev) =>
                      prev[r.id] ? prev : { ...prev, [r.id]: r },
                    )
                  }
                  errors={paymentsErrors}
                  allowedTypes={INCOMING_PAYMENT_TYPES}
                />
              );
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Total orden
              </div>
              <div className="text-lg font-semibold">
                {formatMoney(priceAmount ?? 0)} USD
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Total pagado
              </div>
              <div className="text-lg font-semibold">
                {formatMoney(totalPaid)} USD
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Diferencia
              </div>
              <div className="text-lg font-semibold flex items-center gap-2">
                {Math.abs(diff) < 0.01 ? (
                  <Badge variant="default" className="bg-success text-white">
                    Cuadrado
                  </Badge>
                ) : (
                  <Badge variant="default" className="bg-warning text-white">
                    {diff > 0 ? `Faltan ${formatMoney(diff)}` : `Excede ${formatMoney(Math.abs(diff))}`} USD
                  </Badge>
                )}
              </div>
              {Math.abs(diff) >= 0.01 ? (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {currentRate ? (
                    <div>
                      {diff > 0 ? 'Faltan' : 'Excede'}{' '}
                      <span className="font-mono">
                        Bs{' '}
                        {formatMoney(Math.abs(diff) * Number(currentRate.amountBs))}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </FormSection>
      ) : null}
      </>
      )}

      <PatientCreateModal
        open={createPatientOpen}
        onOpenChange={(o) => {
          setCreatePatientOpen(o);
          if (!o) setCreateTarget(null);
        }}
        onCreated={(p) => {
          if (createTarget === 'holder') onHolderChange(p);
          else if (createTarget === 'patient') onPatientChange(p);
        }}
      />

      {savedOrder ? (
        <AuthorizeAmountModal
          open={authorizeOpen}
          onOpenChange={setAuthorizeOpen}
          orderId={savedOrder.id}
          currentAmount={priceAmount ?? 0}
          onAuthorized={(updated) => {
            setValue('priceAmount', Number(updated.priceAmount), {
              shouldDirty: false,
              shouldValidate: true,
            });
            onOrderRefresh?.();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmTypeChange}
        onOpenChange={(o) => {
          if (!o) setConfirmTypeChange(null);
        }}
        tone="warning"
        icon={AlertTriangle}
        title="Cambiar tipo de orden"
        description="Cambiar el tipo limpiará el titular, paciente y datos de seguro ya seleccionados. ¿Continuar?"
        confirmLabel="Cambiar"
        confirmVariant="destructive"
        onConfirm={confirmTypeChangeApply}
      />
    </>
  );
}
