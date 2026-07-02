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
import { AlertTriangle, Building, ShieldCheck, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { casheaBreakdownCents } from '@/lib/money/cashea';
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
import { PatientEditModal } from './PatientEditModal';
import { SpecialtyCreateModal } from './SpecialtyCreateModal';
import { PathologyCreateModal } from './PathologyCreateModal';
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

const NO_STAGE_PERM = 'No tienes permiso para este paso';

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
      lockedReason: !perms.attention ? NO_STAGE_PERM : 'Guarda la orden primero',
    },
    {
      id: 'report',
      label: '3. Informe médico y estudios',
      description: 'Estudios y observaciones',
      available: savedOrderId && isAttendedOrLater && perms.report,
      lockedReason: !perms.report ? NO_STAGE_PERM : 'Confirma las órdenes internas primero',
    },
    {
      id: 'billing',
      label: '4. Facturación y liquidación',
      description: 'Cierre, factura y liquidación',
      available: savedOrderId && isReportedOrLater && perms.billing,
      lockedReason: !perms.billing ? NO_STAGE_PERM : 'Emite el informe primero',
    },
  ];
}

/**
 * Pasos completados según el estado de la orden (no según la posición del
 * wizard). El stepper los pinta en verde aunque el usuario navegue hacia atrás.
 * Rangos: in_progress→creación lista; attended→+atención; report_issued→+informe;
 * finalized→todos.
 */
function completedStepIds(
  status?: import('../../domain/models/order').OrderStatus,
): string[] {
  const rank: Record<string, number> = {
    draft: 0,
    in_progress: 1,
    attended: 2,
    report_issued: 3,
    finalized: 4,
    cancelled: 0,
  };
  const r = rank[status ?? 'draft'] ?? 0;
  const ids: string[] = [];
  if (r >= 1) ids.push('register');
  if (r >= 2) ids.push('attention');
  if (r >= 3) ids.push('report');
  if (r >= 4) ids.push('billing');
  return ids;
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
  /**
   * Reporta si el Paso 1 cumple la regla de pago según el tipo (sólo bloqueante
   * en `cash`: pagos = total). La página padre lo usa para frenar el submit sin
   * pegar al backend. `true` para tipos sin requisito o ya cuadrados.
   */
  onStep1PaymentOkChange?: (ok: boolean) => void;
};

export function OrderForm({
  initialHolder = null,
  initialPatient = null,
  initialProvider = null,
  savedOrder = null,
  currentStep: externalStep,
  onStepChange,
  onOrderRefresh,
  onStep1PaymentOkChange,
}: OrderFormProps) {
  const me = useAuthStore((s) => s.user);
  const { has } = usePermissions();
  const canEditAmount = has(PERMISSIONS.ORDERS.EDIT_AMOUNT);
  const canAttention = has(PERMISSIONS.ORDERS.STAGE_ATTENTION);
  const canReport = has(PERMISSIONS.ORDERS.STAGE_REPORT);
  const canBilling = has(PERMISSIONS.ORDERS.STAGE_BILLING);
  const canCreateSpecialty = has(PERMISSIONS.SPECIALTIES.CREATE);
  const canCreatePathology = has(PERMISSIONS.PATHOLOGIES.CREATE);
  const canEditPatient = has(PERMISSIONS.PATIENTS.UPDATE);
  // Orden finalizada → Paso 1 de sólo lectura (igual que Paso 2 y 4).
  const isFinalized = savedOrder?.status === 'finalized';
  const { control, setValue, getValues, formState } = useFormContext<OrderValues>();
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const [internalStep, setInternalStep] = useState<string>('register');
  const currentStep = externalStep ?? internalStep;
  const setCurrentStep = (id: string) => {
    if (onStepChange) onStepChange(id);
    else setInternalStep(id);
  };
  const [holder, setHolder] = useState<Patient | null>(initialHolder);
  const [patient, setPatient] = useState<Patient | null>(initialPatient);
  // Con titular pero sin paciente cargado (borrador a medias o carga fallida)
  // el checkbox debe quedar DESMARCADO: mostrarlo marcado ocultaría el select
  // mientras el form no tiene un patientId válido.
  const [sameAsHolder, setSameAsHolder] = useState(
    initialHolder
      ? !!initialPatient && initialHolder.id === initialPatient.id
      : true,
  );
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<'holder' | 'patient' | null>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<'holder' | 'patient' | null>(null);
  const [createSpecialtyOpen, setCreateSpecialtyOpen] = useState(false);
  const [createPathologyOpen, setCreatePathologyOpen] = useState(false);
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

  // Pagos ya existentes (borrador reanudado / orden en edición) pueden referir
  // una tasa EUR que ya no es la vigente: se cargan por id para que
  // `paymentInUsd` no las cuente como $0 y bloquee el cuadre. `attempted`
  // evita re-fetch infinito de ids muertos (tasa borrada).
  const attemptedEurRateIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = Array.from(
      new Set(
        (payments ?? [])
          .filter((p) => p.amountCurrency === 'EUR')
          .map((p) => (p.exchangeRateId ?? '').trim())
          .filter(
            (id) =>
              id && !eurRatesById[id] && !attemptedEurRateIds.current.has(id),
          ),
      ),
    );
    if (missing.length === 0) return;
    missing.forEach((id) => attemptedEurRateIds.current.add(id));
    let cancelled = false;
    Promise.all(
      missing.map((id) => exchangeRateGateway.getById(id).catch(() => null)),
    ).then((rates) => {
      if (cancelled) return;
      const found = rates.filter((r): r is ExchangeRate => !!r);
      if (found.length) {
        setEurRatesById((prev) => {
          const next = { ...prev };
          for (const r of found) next[r.id] = r;
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [payments, eurRatesById]);

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

  // Order type change. Al cambiar de tipo se limpian los campos EXCLUSIVOS del
  // tipo anterior: sin esto quedan valores fantasma (pagos, inicial cashea,
  // clave de servicio) que zod sigue validando sobre secciones ya ocultas y el
  // submit se bloquea con errores en campos invisibles.
  const applyTypeChange = (next: OrderType) => {
    setValue('type', next, { shouldValidate: true, shouldDirty: true });
    if (next !== 'cash' && next !== 'cashea') {
      setValue('payments', [], { shouldDirty: true });
    }
    if (next !== 'cashea') {
      setValue('casheaFirstInstallmentAmount', 0, { shouldDirty: true });
    }
    if (next !== 'insurance') {
      setValue('serviceKey', '', { shouldDirty: true });
    }
    if (next !== 'credit') {
      setValue('isReimbursement', false, { shouldDirty: true });
    }
  };
  const requestTypeChange = (next: OrderType) => {
    if (next === type) return;
    if (holder || patient) {
      setConfirmTypeChange(next);
    } else {
      applyTypeChange(next);
    }
  };
  const confirmTypeChangeApply = () => {
    if (!confirmTypeChange) return;
    applyTypeChange(confirmTypeChange);
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
        if (cancelled) return;
        setAvailableInsurances(list);
        // Si el seguro ya elegido desapareció de los disponibles del titular
        // (quitado como directo o vía contratista al editar el paciente), limpia
        // la selección — así el aviso de "seguro directo" también desaparece y el
        // campo queda listo para re-elegir. Se compara por la clave completa
        // (source|insuranceId|contractorId) contra la lista recién traída.
        const selInsId = getValues('insuranceId');
        const selSrc = getValues('insuranceSource');
        if (selInsId && selSrc) {
          const selCtr = getValues('contractorId') || '';
          const stillAvailable = list.some(
            (o) =>
              o.insurance.id === selInsId &&
              o.source === selSrc &&
              (o.contractor?.id ?? '') === selCtr,
          );
          if (!stillAvailable) {
            setValue('insuranceId', '', { shouldDirty: true, shouldValidate: true });
            setValue('insuranceSource', '', { shouldDirty: true, shouldValidate: true });
            setValue('contractorId', '', { shouldDirty: true });
          }
        }
      })
      .catch(() => !cancelled && setAvailableInsurances([]))
      .finally(() => !cancelled && setLoadingAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [holder, type, getValues, setValue]);

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

  // ¿El seguro seleccionado es indexado? De ahí se deriva el modo tasa fija de la
  // orden (ya no es un checkbox por-orden).
  const selectedInsuranceIndexed = useMemo(() => {
    if (type !== 'insurance' || !currentInsuranceId) return false;
    const opt = availableInsurances.find(
      (o) => o.insurance.id === currentInsuranceId,
    );
    return !!opt?.insurance.isIndexed;
  }, [type, currentInsuranceId, availableInsurances]);

  const orderDateVal = useWatch({ control, name: 'orderDate' }) as
    | string
    | undefined;
  // Tasa "del día de la orden": la más reciente con fecha efectiva ≤ orderDate
  // (usdRates viene ordenado por effectiveDate DESC). Si la orden es anterior a
  // toda tasa cargada, cae en la más antigua disponible.
  const rateForOrderDate = useMemo(() => {
    if (usdRates.length === 0) return null;
    if (!orderDateVal) return usdRates[0];
    const target = new Date(`${orderDateVal}T23:59:59`);
    return (
      usdRates.find((r) => new Date(r.effectiveDate) <= target) ??
      usdRates[usdRates.length - 1]
    );
  }, [usdRates, orderDateVal]);

  const branchSelect = (() => {
    if (userBranches.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          No tienes sucursales asignadas. Solicita acceso a un administrador.
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
          <SelectValue placeholder="Selecciona sucursal" />
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

  // Pagos en Paso 1: contado y cashea (cashea cobra la cuota inicial del titular).
  const showPayments = type === 'cash' || type === 'cashea';
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
    // Mientras no sepamos si el seguro es indexado (la lista de seguros del
    // titular aún carga), NO toques los valores reseteados: evita borrar la tasa
    // persistida de una orden indexada en edición y ensuciar el form al abrir.
    if (
      type === 'insurance' &&
      currentInsuranceId &&
      (loadingAvailable || availableInsurances.length === 0)
    ) {
      return;
    }
    // `useFixedRate` se deriva de si el seguro es indexado (no es un checkbox).
    if (!selectedInsuranceIndexed) {
      if (useFixedRateVal)
        setValue('useFixedRate', false, { shouldDirty: true, shouldValidate: true });
      if (fixedExchangeRateIdVal)
        setValue('fixedExchangeRateId', '', { shouldDirty: true });
      return;
    }
    if (!useFixedRateVal)
      setValue('useFixedRate', true, { shouldDirty: true, shouldValidate: true });
    // Auto-seleccionar la tasa del día de la orden si falta (preserva la elegida).
    if (!fixedExchangeRateIdVal && rateForOrderDate) {
      setValue('fixedExchangeRateId', rateForOrderDate.id, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [
    type,
    currentInsuranceId,
    loadingAvailable,
    availableInsurances,
    selectedInsuranceIndexed,
    useFixedRateVal,
    fixedExchangeRateIdVal,
    rateForOrderDate,
    setValue,
  ]);
  const fixedRateObj = useMemo(
    () =>
      fixedExchangeRateIdVal
        ? usdRates.find((r) => r.id === fixedExchangeRateIdVal) ?? null
        : null,
    [fixedExchangeRateIdVal, usdRates],
  );

  // Cashea: tasas snapshot si la orden ya tiene snapshot, sino la config global
  // cargada on-demand. El monto de la inicial es un campo del form (editable en
  // borrador) y la cobra el comercio del titular en el Paso 1.
  const casheaFirstInstallmentAmount = useWatch({
    control,
    name: 'casheaFirstInstallmentAmount',
  }) as number | undefined;
  const [globalCasheaConfig, setGlobalCasheaConfig] = useState<{
    commissionRate: number;
    financingRate: number;
  } | null>(null);
  useEffect(() => {
    if (!isCashea) return;
    // Sólo necesitamos la config global cuando la orden aún no tiene snapshot.
    if (savedOrder?.casheaCommissionRate != null) return;
    let cancelled = false;
    appConfigGateway
      .getCasheaCommission()
      .then(
        (cfg) =>
          !cancelled &&
          setGlobalCasheaConfig({
            commissionRate: cfg.commissionRate,
            financingRate: cfg.financingRate,
          }),
      )
      .catch(() => !cancelled && setGlobalCasheaConfig(null));
    return () => {
      cancelled = true;
    };
  }, [isCashea, savedOrder]);
  const casheaCommissionRate = isCashea
    ? savedOrder?.casheaCommissionRate != null
      ? Number(savedOrder.casheaCommissionRate)
      : globalCasheaConfig?.commissionRate ?? 0.0464
    : 0;
  const casheaFinancingRate = isCashea
    ? savedOrder?.casheaFinancingRate != null
      ? Number(savedOrder.casheaFinancingRate)
      : globalCasheaConfig?.financingRate ?? 0.062
    : 0;
  const casheaFirstAmount = isCashea ? casheaFirstInstallmentAmount ?? 0 : 0;

  // Target de cuadre del Paso 1: contado cuadra el total de la orden; cashea
  // cuadra la inicial (pago real del titular; el resto lo financia Cashea).
  const paymentTarget = isCashea ? casheaFirstAmount : priceAmount ?? 0;
  const diff = paymentTarget - totalPaid;

  // Reporta al padre si el Paso 1 cumple la regla de pago. Sólo `cash` bloquea
  // aquí (debe cuadrar); `cashea` (inicial > 0) ya lo valida zod; crédito/seguro
  // no piden pago. Permite frenar el submit sin pegar al backend.
  const step1PaymentOk = type !== 'cash' || Math.abs(diff) < 0.01;
  useEffect(() => {
    onStep1PaymentOkChange?.(step1PaymentOk);
  }, [step1PaymentOk, onStep1PaymentOkChange]);
  // Desglose exacto en centavos enteros (espeja el backend) → sin drift toFixed.
  // restante = total − inicial; comisión = total × commissionRate;
  // financiamiento = restante × financingRate; neto = restante − com − fin.
  const casheaBreakdown = isCashea
    ? casheaBreakdownCents(
        priceAmount ?? 0,
        casheaFirstAmount,
        casheaCommissionRate,
        casheaFinancingRate,
      )
    : { remainingCents: 0, commissionCents: 0, financingCents: 0, netCents: 0 };
  const casheaRemaining = casheaBreakdown.remainingCents / 100;
  const casheaCommissionAmount = casheaBreakdown.commissionCents / 100;
  const casheaFinancingAmount = casheaBreakdown.financingCents / 100;
  const casheaNet = casheaBreakdown.netCents / 100;
  const casheaCommissionRatePct = +(casheaCommissionRate * 100).toFixed(2);
  const casheaFinancingRatePct = +(casheaFinancingRate * 100).toFixed(2);

  // Price breakdown derived from selected service types + insurance/Particular.
  const orderServiceTypeRows = (useWatch({ control, name: 'serviceTypes' }) ?? []) as Array<{
    serviceTypeId: string;
    providerType: 'doctor' | 'care_center';
    doctorId?: string;
    careCenterId?: string;
    quantity?: number;
    customName?: string | null;
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
    // Nombre custom por ST (override del baremo) para mostrar en Paso 1.
    const cnByST = new Map(
      orderServiceTypeRows.map((r) => [r.serviceTypeId, (r.customName ?? '').trim()]),
    );
    return serviceTypeIds.map((id) => {
      const st = serviceTypes.find((s) => s.id === id);
      const qty = qtyByST.get(id) ?? 1;
      const custom = cnByST.get(id) || '';
      if (!st) return { id, name: custom || '—', qty, unit: null, amount: null };
      const raw = isInsuranceOrder
        ? ispByST.get(id)?.priceUsd
        : st.particularPriceUsd;
      const num = raw === null || raw === undefined ? null : Number(raw);
      const unit = num !== null && Number.isFinite(num) && num > 0 ? num : null;
      return {
        id,
        name: custom || st.name,
        qty,
        unit,
        amount: unit !== null ? +(unit * qty).toFixed(2) : null,
      };
    });
  }, [
    serviceTypeIds,
    serviceTypes,
    insuranceServicePrices,
    isInsuranceOrder,
    qtyByST,
    orderServiceTypeRows,
  ]);

  const computedPriceSum = useMemo(
    () => priceLines.reduce((acc, l) => acc + (l.amount ?? 0), 0),
    [priceLines],
  );
  const hasMissingPrices = priceLines.some((l) => l.amount === null);

  // Precio unitario por Tipo de Servicio para el selector de la tabla:
  // seguro → baremo del seguro elegido; particular → particularPriceUsd.
  // Cuando es seguro con seguro elegido, sólo se ofrecen STs con baremo.
  const stPriceMap = useMemo(() => {
    const m = new Map<string, number>();
    if (isInsuranceOrder) {
      for (const r of insuranceServicePrices) {
        const n = Number(r.priceUsd);
        if (Number.isFinite(n) && n > 0) m.set(r.serviceTypeId, n);
      }
    } else {
      for (const st of serviceTypes) {
        const raw = st.particularPriceUsd;
        const n = raw === null || raw === undefined ? null : Number(raw);
        if (n !== null && Number.isFinite(n) && n > 0) m.set(st.id, n);
      }
    }
    return m;
  }, [isInsuranceOrder, insuranceServicePrices, serviceTypes]);
  const restrictToPriced = isInsuranceOrder && !!insuranceId;

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
      <Stepper
        steps={orderSteps}
        current={currentStep}
        onSelect={setCurrentStep}
        completedIds={completedStepIds(savedOrder?.status)}
      />

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
      <fieldset
        disabled={isFinalized}
        className="space-y-6 border-0 p-0 m-0 min-w-0"
      >
      {isFinalized ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          La orden está finalizada. Los datos del Paso 1 son de sólo lectura.
        </div>
      ) : null}
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

          {type === 'credit' ? (
            <Controller
              control={control}
              name="isReimbursement"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <input
                    id="isReimbursement"
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    disabled={!!savedOrder && savedOrder.status !== 'draft'}
                    className="h-4 w-4 mt-0.5"
                  />
                  <Label htmlFor="isReimbursement" className="text-sm leading-tight">
                    Orden de reembolso
                    <span className="block text-xs text-muted-foreground font-normal">
                      Marca "R" en la clave de servicio de la orden interna.
                    </span>
                  </Label>
                </div>
              )}
            />
          ) : null}
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
            onEditClick={
              canEditPatient && holder
                ? () => {
                    setEditTarget('holder');
                    setEditPatientOpen(true);
                  }
                : undefined
            }
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
              onEditClick={
                canEditPatient && patient
                  ? () => {
                      setEditTarget('patient');
                      setEditPatientOpen(true);
                    }
                  : undefined
              }
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
                        ? 'Selecciona un titular primero'
                        : loadingAvailable
                          ? 'Cargando seguros…'
                          : availableInsurances.length === 0
                            ? 'Titular sin seguros disponibles'
                            : 'Selecciona un seguro'
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
                {!currentInsuranceId ? null : selectedInsuranceIndexed ? (
                  <div className="space-y-1.5">
                    <RequiredLabel required>Tasa de la orden (USD/Bs)</RequiredLabel>
                    <p className="text-[11px] text-muted-foreground">
                      Seguro <strong>indexado</strong>: la cuenta por cobrar queda
                      fija en bolívares a la tasa del día de la orden. Los cobros se
                      descuentan en Bs sin importar la tasa del día del pago.
                    </p>
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
                                  : 'Selecciona tasa USD/Bs'
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
                    <FieldError message={errors.fixedExchangeRateId?.message} />
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
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    Seguro <strong>no indexado</strong>: la cuenta por cobrar se
                    cobra a la tasa del día del cobro (USD).
                  </div>
                )}
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
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
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
                        <SelectValue placeholder="Selecciona especialidad" />
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
              </div>
              {canCreateSpecialty ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setCreateSpecialtyOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" /> Crear
                </Button>
              ) : null}
            </div>
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
            {canCreatePathology ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCreatePathologyOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Crear patología
                </Button>
              </div>
            ) : null}
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
                    customName?: { message?: string };
                  }
                | undefined
              >
            )?.map?.((e) => ({
              serviceTypeId: e?.serviceTypeId?.message,
              providerType: e?.providerType?.message,
              doctorId: e?.doctorId?.message,
              careCenterId: e?.careCenterId?.message,
              quantity: e?.quantity?.message,
              customName: e?.customName?.message,
            }));
            return (
              <ServiceProviderTable
                value={(field.value ?? []) as Array<{
                  serviceTypeId: string;
                  providerType: 'doctor' | 'care_center';
                  doctorId?: string;
                  careCenterId?: string;
                  quantity?: number;
                  customName?: string | null;
                }>}
                onChange={field.onChange}
                serviceTypes={serviceTypes}
                errors={rowErrors}
                initialProviders={initialProvidersMap}
                priceByServiceTypeId={stPriceMap}
                restrictToPriced={restrictToPriced}
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
              : 'Suma de los precios "Particular" de cada tipo de servicio. No tienes permiso para editar el monto.'
        }
      >
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel>Moneda</RequiredLabel>
            <Input readOnly value="USD" className="h-9 bg-muted/30" />
          </div>
          <div className="space-y-1.5">
            <RequiredLabel>
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
                  readOnly
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
              No tienes permiso para editar el monto. Un validador con permiso puede
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
                Hay tipos de servicio sin precio definido para esta combinación. Define los precios
                desde el módulo Tipos de Servicio.
              </div>
            ) : null}
          </div>
        ) : null}
        {isCashea ? (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5 max-w-xs">
              <RequiredLabel required>Inicial</RequiredLabel>
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
              <p className="text-[11px] text-muted-foreground leading-tight">
                La cobra el comercio del titular en el Paso 1. No genera comisión.
              </p>
            </div>
            <div className="rounded-lg border border-dashed bg-warning-soft/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Precio total
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(priceAmount ?? 0)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Inicial
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(casheaFirstAmount)} USD
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Restante
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(casheaRemaining)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  total − inicial
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
                  {casheaCommissionRatePct}% del total
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Financiamiento
                </div>
                <div className="text-sm font-semibold text-destructive">
                  -{formatMoney(casheaFinancingAmount)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {casheaFinancingRatePct}% del restante
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Monto a recibir por Cashea
                </div>
                <div className="text-base font-bold text-success">
                  {formatMoney(casheaNet)} USD
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  restante − comisión − financiamiento
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {savedOrder?.casheaCommissionRate != null
                ? 'Tasas fijas — porcentajes snapshot al crear la orden.'
                : 'Porcentajes vigentes al momento de crear la orden. Configurables en Administración → Configuración.'}
            </p>
          </div>
        ) : null}
      </FormSection>

      {showPayments ? (
        <FormSection
          title="Pagos"
          description="Registra los pagos recibidos. La diferencia con el precio se mostrará abajo."
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
                          paymentAccountId: e.paymentAccountId?.message,
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
                {isCashea ? 'Inicial' : 'Total orden'}
              </div>
              <div className="text-lg font-semibold">
                {formatMoney(paymentTarget)} USD
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

          {Math.abs(diff) >= 0.01 ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {isCashea ? (
                  <>
                    Cashea requiere cobrar la <strong>inicial</strong> (pagos = inicial)
                    para poder crear la orden y continuar al Paso 2.
                  </>
                ) : (
                  <>
                    La orden de contado debe estar <strong>cuadrada</strong> (pagos = total)
                    para poder crearla y continuar al Paso 2.
                  </>
                )}
              </span>
            </div>
          ) : null}
        </FormSection>
      ) : null}
      </fieldset>
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

      <PatientEditModal
        open={editPatientOpen}
        onOpenChange={(o) => {
          setEditPatientOpen(o);
          if (!o) setEditTarget(null);
        }}
        patientId={
          editTarget === 'holder' ? holder?.id ?? null : patient?.id ?? null
        }
        onSaved={(updated) => {
          // Reemplaza la referencia del titular/paciente: nueva identidad de
          // objeto → el efecto de `availableInsurances` refetch-ea los seguros
          // del titular. NO se limpia el seguro/contratista ya elegido (a
          // diferencia de cambiar de titular): la edición conserva la selección.
          if (editTarget === 'holder') {
            setHolder(updated);
            if (sameAsHolder) setPatient(updated);
          } else if (editTarget === 'patient') {
            setPatient(updated);
          }
        }}
      />

      <SpecialtyCreateModal
        open={createSpecialtyOpen}
        onOpenChange={setCreateSpecialtyOpen}
        onCreated={(sp) => {
          setSpecialties((prev) =>
            prev.some((s) => s.id === sp.id) ? prev : [sp, ...prev],
          );
          setValue('specialtyId', sp.id, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />

      <PathologyCreateModal
        open={createPathologyOpen}
        onOpenChange={setCreatePathologyOpen}
        onCreated={(pa) => {
          setPathologies((prev) =>
            prev.some((p) => p.id === pa.id) ? prev : [pa, ...prev],
          );
          const current = (getValues('pathologyIds') ?? []) as string[];
          if (!current.includes(pa.id)) {
            setValue('pathologyIds', [...current, pa.id], {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
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
