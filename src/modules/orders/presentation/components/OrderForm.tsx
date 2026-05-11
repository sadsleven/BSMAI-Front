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
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Stepper, type StepDef } from '@/components/ui/stepper';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AlertTriangle, Building, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import {
  getLastBranchId,
  getUserBranches,
  setLastBranchId,
} from '@/lib/auth/branches';
import type {
  OrderCurrency,
  OrderType,
  ProviderType,
} from '../../domain/models/order';
import { ORDER_TYPE_LABEL } from '../../domain/models/order';
import type { OrderValues } from '@/lib/validations/schemas';
import type { Patient } from '@/modules/patients/domain/models/patient';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Pathology } from '@/modules/pathologies/domain/models/pathology';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { serviceTypeGateway } from '@/modules/service-types/infrastructure/serviceTypeGateway';
import { pathologyGateway } from '@/modules/pathologies/infrastructure/pathologyGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import { PatientSearchSelect } from './PatientSearchSelect';
import { PatientCreateModal } from './PatientCreateModal';
import {
  ProviderSearchSelect,
  type ProviderSelectValue,
} from './ProviderSearchSelect';
import {
  OrderPaymentForm,
  paymentInOrderCurrency,
  type PaymentItemErrors,
} from './OrderPaymentForm';
import type { Order } from '../../domain/models/order';
import { OrderAttendStep } from './stages/OrderAttendStep';
import { OrderReportStep } from './stages/OrderReportStep';
import { OrderBillingStep } from './stages/OrderBillingStep';

function buildOrderSteps(savedOrderId: boolean): StepDef[] {
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
      description: savedOrderId ? 'Marcar atendido + órdenes internas' : '',
      available: savedOrderId,
    },
    {
      id: 'report',
      label: '3. Informe médico y estudios',
      description: 'Estudios y observaciones',
      available: savedOrderId,
    },
    {
      id: 'billing',
      label: '4. Facturación y liquidación',
      description: 'Cierre, factura y liquidación',
      available: savedOrderId,
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
  const [provider, setProvider] = useState<ProviderSelectValue | null>(initialProvider);
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<'holder' | 'patient' | null>(null);
  const [confirmTypeChange, setConfirmTypeChange] = useState<OrderType | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);

  const userBranches = useMemo(() => getUserBranches(me), [me]);
  const branchId = useWatch({ control, name: 'branchId' });
  const type = useWatch({ control, name: 'type' });
  const providerType = useWatch({ control, name: 'providerType' });
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
    pathologyGateway.listAssignable().then(setPathologies).catch(() => setPathologies([]));
  }, []);

  const priceCurrency = useWatch({ control, name: 'priceCurrency' }) as
    | 'USD'
    | 'EUR'
    | undefined;

  useEffect(() => {
    if (!priceCurrency) return;
    let cancelled = false;
    exchangeRateGateway
      .getCurrent(priceCurrency)
      .then((r) => !cancelled && setCurrentRate(r))
      .catch(() => !cancelled && setCurrentRate(null));
    return () => {
      cancelled = true;
    };
  }, [priceCurrency]);

  const lookupRate = (id: string) =>
    currentRate && currentRate.id === id ? currentRate : null;

  // Holder/patient sync
  const onHolderChange = (next: Patient | null) => {
    setHolder(next);
    setValue('holderId', next?.id ?? '', { shouldValidate: true, shouldDirty: true });
    setValue('contractorId', '', { shouldDirty: true });
    setValue('insuranceId', '', { shouldDirty: true });
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

  // Provider change → clear specialty
  const onProviderChange = (next: ProviderSelectValue | null) => {
    setProvider(next);
    if (next?.providerType === 'doctor') {
      setValue('doctorId', next.doctor.id, { shouldValidate: true, shouldDirty: true });
      setValue('careCenterId', '', { shouldDirty: true });
    } else if (next?.providerType === 'care_center') {
      setValue('careCenterId', next.careCenter.id, { shouldValidate: true, shouldDirty: true });
      setValue('doctorId', '', { shouldDirty: true });
    } else {
      setValue('doctorId', '', { shouldDirty: true });
      setValue('careCenterId', '', { shouldDirty: true });
    }
    setValue('specialtyId', '', { shouldDirty: true });
  };

  const onProviderTypeChange = (next: ProviderType) => {
    setValue('providerType', next, { shouldValidate: true, shouldDirty: true });
    onProviderChange(null);
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
    setConfirmTypeChange(null);
  };

  const providerSpecialties: Specialty[] = useMemo(() => {
    if (!provider) return [];
    return provider.providerType === 'doctor'
      ? provider.doctor.specialties
      : provider.careCenter.specialties;
  }, [provider]);

  const holderContractors = holder?.contractors ?? [];
  const selectedContractorId = useWatch({ control, name: 'contractorId' }) as string | '' | undefined;
  const selectedContractor = holderContractors.find((c) => c.id === selectedContractorId);
  const insurancesForSelectedContractor = selectedContractor?.insurances ?? [];

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

  // Payments totals
  const totalPaid = useMemo(() => {
    if (!payments) return 0;
    return payments.reduce(
      (acc, p) => acc + paymentInOrderCurrency(p, (priceCurrency as OrderCurrency) ?? 'USD', lookupRate),
      0,
    );
  }, [payments, priceCurrency, currentRate]);

  const priceAmount = useWatch({ control, name: 'priceAmount' }) as number | undefined;
  const diff = (priceAmount ?? 0) - totalPaid;
  const diffBs =
    currentRate && currentRate.amountBs ? diff * Number(currentRate.amountBs) : null;

  const showPayments = type === 'cash';
  const isCashea = type === 'cashea';
  const casheaNet = isCashea ? +(((priceAmount ?? 0) * 0.9).toFixed(2)) : 0;

  // Price breakdown derived from selected service types + insurance/Particular.
  const serviceTypeIds = (useWatch({ control, name: 'serviceTypeIds' }) ?? []) as string[];
  const insuranceId = useWatch({ control, name: 'insuranceId' }) as string | '' | undefined;
  const isInsuranceOrder = type === 'insurance';

  type PriceLine = {
    id: string;
    name: string;
    /** null si el ST no tiene precio definido para esta combinación. */
    amount: number | null;
  };

  const priceLines: PriceLine[] = useMemo(() => {
    const lookupKey: string | null = isInsuranceOrder ? (insuranceId || null) : null;
    const ccy = (priceCurrency as 'USD' | 'EUR' | undefined) ?? 'USD';
    return serviceTypeIds.map((id) => {
      const st = serviceTypes.find((s) => s.id === id);
      if (!st) return { id, name: '—', amount: null };
      const row = (st.prices ?? []).find((p) =>
        lookupKey === null ? !p.insuranceId : p.insuranceId === lookupKey,
      );
      if (!row) return { id, name: st.name, amount: null };
      const raw = ccy === 'USD' ? row.priceUsd : row.priceEur;
      const num = raw === null || raw === undefined ? null : Number(raw);
      return {
        id,
        name: st.name,
        amount: num !== null && Number.isFinite(num) ? num : null,
      };
    });
  }, [serviceTypeIds, serviceTypes, insuranceId, isInsuranceOrder, priceCurrency]);

  const computedPriceSum = useMemo(
    () => priceLines.reduce((acc, l) => acc + (l.amount ?? 0), 0),
    [priceLines],
  );
  const hasMissingPrices = priceLines.some((l) => l.amount === null);

  // Auto-set priceAmount when selección/moneda cambian.
  // Insurance: locked → siempre sincroniza con la suma calculada (ignora input manual).
  // Cash/credit/cashea: overwrite cuando cambian inputs — el usuario puede editar luego.
  const lastAppliedSumRef = useRef<number | null>(null);
  useEffect(() => {
    if (priceLines.length === 0) return;
    const rounded = +computedPriceSum.toFixed(2);
    const current = priceAmount ?? 0;
    if (isInsuranceOrder) {
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
  }, [computedPriceSum, isInsuranceOrder, insuranceId, priceCurrency, serviceTypeIds.join(',')]);

  const orderSteps = buildOrderSteps(!!savedOrder);
  const renderStep1 = currentStep === 'register';

  return (
    <>
      <Stepper steps={orderSteps} current={currentStep} onSelect={setCurrentStep} />

      {!renderStep1 && currentStep === 'attention' && savedOrder ? (
        <OrderAttendStep
          order={savedOrder}
          onSaved={() => onOrderRefresh?.()}
        />
      ) : null}

      {!renderStep1 && currentStep === 'report' && savedOrder ? (
        <OrderReportStep
          order={savedOrder}
          onSaved={() => onOrderRefresh?.()}
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
      <FormSection title="Sucursal" description="Sucursal donde se emite la orden.">
        <div className="space-y-1.5">
          <RequiredLabel required>
            <Building className="w-4 h-4 inline mr-1.5 text-muted-foreground" />
            Sucursal
          </RequiredLabel>
          {branchSelect}
          <FieldError message={errors.branchId?.message} />
        </div>
      </FormSection>

      <FormSection title="Tipo de orden" description="Define la modalidad y los datos requeridos.">
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
              Solo se listan pacientes con al menos un seguro y un contratista asignados.
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
            <FormGrid>
              <div className="space-y-1.5">
                <RequiredLabel required>Contratista</RequiredLabel>
                <Controller
                  control={control}
                  name="contractorId"
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setValue('insuranceId', '', { shouldDirty: true });
                      }}
                      disabled={!holder || holderContractors.length === 0}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-9',
                          errors.contractorId?.message && 'border-destructive',
                        )}
                      >
                        <SelectValue
                          placeholder={
                            !holder
                              ? 'Seleccioná un titular primero'
                              : holderContractors.length === 0
                                ? 'Titular sin contratistas'
                                : 'Seleccioná contratista'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {holderContractors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.contractorId?.message} />
              </div>

              <div className="space-y-1.5">
                <RequiredLabel required>Seguro</RequiredLabel>
                <Controller
                  control={control}
                  name="insuranceId"
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      disabled={!selectedContractor || insurancesForSelectedContractor.length === 0}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-9',
                          errors.insuranceId?.message && 'border-destructive',
                        )}
                      >
                        <SelectValue
                          placeholder={
                            !selectedContractor
                              ? 'Seleccioná un contratista primero'
                              : insurancesForSelectedContractor.length === 0
                                ? 'Contratista sin seguros'
                                : 'Seleccioná seguro'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {insurancesForSelectedContractor.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.insuranceId?.message} />
              </div>
            </FormGrid>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="Proveedor del servicio"
        description="Doctor o centro que atenderá la orden."
        allowOverflow
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {(['doctor', 'care_center'] as ProviderType[]).map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => onProviderTypeChange(pt)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  providerType === pt
                    ? 'border-brand-blue bg-brand-blue-soft'
                    : 'border-border hover:bg-accent',
                )}
              >
                {pt === 'doctor' ? 'Doctor' : 'Centro de atención'}
              </button>
            ))}
          </div>
          <ProviderSearchSelect
            providerType={(providerType ?? 'doctor') as ProviderType}
            value={provider}
            onChange={onProviderChange}
            required
            error={errors.doctorId?.message ?? errors.careCenterId?.message}
          />
        </div>
      </FormSection>

      <FormSection title="Servicio" description="Especialidad, tipo de servicio y patología.">
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel required>Especialidad</RequiredLabel>
            <Controller
              control={control}
              name="specialtyId"
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  disabled={!provider || providerSpecialties.length === 0}
                >
                  <SelectTrigger
                    className={cn('h-9', errors.specialtyId?.message && 'border-destructive')}
                  >
                    <SelectValue
                      placeholder={
                        !provider
                          ? 'Seleccioná un proveedor primero'
                          : providerSpecialties.length === 0
                            ? 'Proveedor sin especialidades'
                            : 'Seleccioná especialidad'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {providerSpecialties.map((s) => (
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
            <RequiredLabel required>Tipos de servicio</RequiredLabel>
            <Controller
              control={control}
              name="serviceTypeIds"
              render={({ field }) => {
                const selected: string[] = Array.isArray(field.value) ? field.value : [];
                const toggle = (id: string) =>
                  field.onChange(
                    selected.includes(id)
                      ? selected.filter((v) => v !== id)
                      : [...selected, id],
                  );
                return (
                  <div
                    className={cn(
                      'flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/20 min-h-[44px]',
                      errors.serviceTypeIds?.message && 'border-destructive',
                    )}
                  >
                    {serviceTypes.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No hay tipos de servicio activos.
                      </span>
                    ) : (
                      serviceTypes.map((s) => {
                        const active = selected.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggle(s.id)}
                            className={cn(
                              'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-accent',
                            )}
                          >
                            {s.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              }}
            />
            <FieldError
              message={
                typeof errors.serviceTypeIds?.message === 'string'
                  ? errors.serviceTypeIds.message
                  : undefined
              }
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <RequiredLabel>Patologías (opcional)</RequiredLabel>
            <Controller
              control={control}
              name="pathologyIds"
              render={({ field }) => {
                const selected: string[] = Array.isArray(field.value) ? field.value : [];
                const toggle = (id: string) =>
                  field.onChange(
                    selected.includes(id)
                      ? selected.filter((v) => v !== id)
                      : [...selected, id],
                  );
                return (
                  <div
                    className={cn(
                      'flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/20 min-h-[44px]',
                      errors.pathologyIds?.message && 'border-destructive',
                    )}
                  >
                    {pathologies.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No hay patologías activas.
                      </span>
                    ) : (
                      pathologies.map((p) => {
                        const active = selected.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggle(p.id)}
                            className={cn(
                              'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-accent',
                            )}
                          >
                            {p.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              }}
            />
            <FieldError
              message={
                typeof errors.pathologyIds?.message === 'string'
                  ? errors.pathologyIds.message
                  : undefined
              }
            />
          </div>
        </FormGrid>
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
            : 'Suma de los precios "Particular" de cada tipo de servicio. Editable.'
        }
      >
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel required>Moneda</RequiredLabel>
            <Controller
              control={control}
              name="priceCurrency"
              render={({ field }) => (
                <Select value={field.value || 'USD'} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
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
                  currencyPrefix={priceCurrency || 'USD'}
                  disabled={isInsuranceOrder}
                  className={cn(errors.priceAmount?.message && 'border-destructive')}
                />
              )}
            />
            <FieldError message={errors.priceAmount?.message} />
          </div>
        </FormGrid>

        {priceLines.length > 0 ? (
          <div className="mt-4 rounded-lg border bg-muted/20">
            <div className="px-3 py-2 border-b text-[11px] uppercase tracking-[0.06em] text-muted-foreground flex items-center justify-between">
              <span>
                Detalle por tipo de servicio · {isInsuranceOrder ? 'Tarifa de seguro' : 'Particular'}
              </span>
              <span>{priceCurrency || 'USD'}</span>
            </div>
            <div className="divide-y">
              {priceLines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="truncate">{l.name}</span>
                  <span
                    className={cn(
                      'font-mono',
                      l.amount === null && 'text-warning',
                    )}
                  >
                    {l.amount === null
                      ? 'Sin precio definido'
                      : l.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-muted/40">
                <span>Total</span>
                <span className="font-mono">
                  {computedPriceSum.toFixed(2)} {priceCurrency || 'USD'}
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
          <div className="mt-4 rounded-lg border border-dashed bg-warning-soft/40 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Precio
              </div>
              <div className="text-sm font-semibold">
                {(priceAmount ?? 0).toFixed(2)} {priceCurrency}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Comisión Cashea (10%)
              </div>
              <div className="text-sm font-semibold text-destructive">
                -{((priceAmount ?? 0) * 0.1).toFixed(2)} {priceCurrency}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Monto a recibir por Cashea
              </div>
              <div className="text-base font-bold text-success">
                {casheaNet.toFixed(2)} {priceCurrency}
              </div>
            </div>
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
                  orderCurrency={(priceCurrency as OrderCurrency) ?? 'USD'}
                  currentRate={currentRate}
                  errors={paymentsErrors}
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
                {(priceAmount ?? 0).toFixed(2)} {priceCurrency}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                Total pagado
              </div>
              <div className="text-lg font-semibold">
                {totalPaid.toFixed(2)} {priceCurrency}
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
                    {diff > 0 ? `Faltan ${diff.toFixed(2)}` : `Excede ${Math.abs(diff).toFixed(2)}`}
                  </Badge>
                )}
              </div>
              {Math.abs(diff) >= 0.01 ? (
                diffBs !== null ? (
                  <div className="text-xs text-muted-foreground">
                    {diff > 0 ? 'Faltan' : 'Excede'}{' '}
                    <span className="font-mono">
                      Bs. {Math.abs(diffBs).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="ml-1 text-[10px]">
                      (tasa {Number(currentRate?.amountBs ?? 0).toFixed(2)} Bs/{priceCurrency})
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    Sin tasa de cambio activa para {priceCurrency} — no se puede calcular diferencia en Bs.
                  </div>
                )
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
