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
import { Textarea } from '@/components/ui/textarea';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DatePicker } from '@/components/ui/date-picker';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import {
  AlertTriangle,
  Building,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import {
  getLastBranchId,
  getUserBranches,
  setLastBranchId,
} from '@/lib/auth/branches';
import type { BudgetValues } from '@/lib/validations/schemas';
import type { Patient, PatientAvailableInsurance } from '@/modules/patients/domain/models/patient';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Pathology } from '@/modules/pathologies/domain/models/pathology';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import type { PaymentAccount } from '@/modules/payment-accounts/domain/models/paymentAccount';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import { serviceTypeGateway } from '@/modules/service-types/infrastructure/serviceTypeGateway';
import { pathologyGateway } from '@/modules/pathologies/infrastructure/pathologyGateway';
import { specialtyGateway } from '@/modules/specialties/infrastructure/specialtyGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import { paymentAccountGateway } from '@/modules/payment-accounts/infrastructure/paymentAccountGateway';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { PatientSearchSelect } from '@/modules/orders/presentation/components/PatientSearchSelect';
import { PatientCreateModal } from '@/modules/orders/presentation/components/PatientCreateModal';
import { PathologyCreateModal } from '@/modules/orders/presentation/components/PathologyCreateModal';
import { formatDateOnly } from '@/lib/dates';
import {
  BUDGET_TYPE_LABEL,
  BUDGET_TYPE_ORDER,
  type BudgetType,
} from '../../domain/models/budget';
import {
  BudgetServiceTable,
  type BudgetServiceRowValue,
} from './BudgetServiceTable';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertTriangle className="h-3 w-3" />
      {message}
    </p>
  );
}

function RequiredLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="text-sm font-medium">
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </Label>
  );
}

export type BudgetFormProps = {
  /** Titular precargado al editar (hidrata el chip del buscador). */
  initialHolder?: Patient | null;
  initialPatient?: Patient | null;
  /** Proveedores ya elegidos al editar. Clave `${type}:${id}`. */
  initialProviders?: Map<string, Doctor | CareCenter>;
  /** Presupuesto ya convertido en orden: todo de sólo lectura. */
  readOnly?: boolean;
};

/**
 * Formulario del presupuesto. Es el Paso 1 de la orden recortado a lo que un
 * presupuesto necesita: a quién, qué servicios, a qué precio y hasta cuándo
 * vale. Sin pagos, sin fecha de atención, sin número de orden.
 */
export function BudgetForm({
  initialHolder,
  initialPatient,
  initialProviders,
  readOnly,
}: BudgetFormProps) {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<BudgetValues>();
  const { has } = usePermissions();
  const canEditAmount = has(PERMISSIONS.BUDGETS.EDIT_AMOUNT);
  const canCreatePatient = has(PERMISSIONS.PATIENTS.CREATE);
  const canCreatePathology = has(PERMISSIONS.PATHOLOGIES.CREATE);

  const type = useWatch({ control, name: 'type' }) as BudgetType;
  const branchId = useWatch({ control, name: 'branchId' }) as string;
  const insuranceId = useWatch({ control, name: 'insuranceId' }) as string | '';
  const insuranceSource = useWatch({ control, name: 'insuranceSource' }) as
    | 'direct'
    | 'via_contractor'
    | ''
    | undefined;
  const contractorId = useWatch({ control, name: 'contractorId' }) as string | '';
  const watchedRows = useWatch({ control, name: 'serviceTypes' });
  // `useWatch` devuelve `undefined` en el primer render: el `?? []` crearía un
  // array nuevo cada vez y re-dispararía los `useMemo` que dependen de él.
  const serviceRows = useMemo(
    () => (watchedRows ?? []) as BudgetServiceRowValue[],
    [watchedRows],
  );
  const priceAmount = useWatch({ control, name: 'priceAmount' }) as
    | number
    | undefined;
  const priceBaseAmount = useWatch({ control, name: 'priceBaseAmount' }) as
    | number
    | undefined;
  const budgetDate = useWatch({ control, name: 'budgetDate' }) as string;

  const isInsurance = type === 'insurance';

  // ---- Titular / paciente ----
  const [holder, setHolder] = useState<Patient | null>(initialHolder ?? null);
  const [patient, setPatient] = useState<Patient | null>(initialPatient ?? null);
  const [sameAsHolder, setSameAsHolder] = useState(
    () => !initialPatient || initialPatient.id === initialHolder?.id,
  );
  useEffect(() => {
    if (initialHolder) setHolder(initialHolder);
  }, [initialHolder]);
  useEffect(() => {
    if (initialPatient) {
      setPatient(initialPatient);
      setSameAsHolder(initialPatient.id === initialHolder?.id);
    }
  }, [initialPatient, initialHolder]);

  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<'holder' | 'patient'>('holder');
  const [createPathologyOpen, setCreatePathologyOpen] = useState(false);

  const onHolderChange = (next: Patient | null) => {
    setHolder(next);
    setValue('holderId', next?.id ?? '', {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (sameAsHolder) {
      setPatient(next);
      setValue('patientId', next?.id ?? '', {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    // El seguro cuelga del titular: cambiar de titular invalida la selección.
    setValue('insuranceId', '', { shouldDirty: true, shouldValidate: true });
    setValue('insuranceSource', '', { shouldDirty: true, shouldValidate: true });
    setValue('contractorId', '', { shouldDirty: true });
  };

  const onPatientChange = (next: Patient | null) => {
    setPatient(next);
    setValue('patientId', next?.id ?? '', {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const toggleSameAsHolder = (v: boolean) => {
    setSameAsHolder(v);
    if (v) {
      setPatient(holder);
      setValue('patientId', holder?.id ?? '', {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      setPatient(null);
      setValue('patientId', '', { shouldDirty: true, shouldValidate: true });
    }
  };

  // ---- Sucursal ----
  const me = useAuthStore((s) => s.user);
  const userBranches = useMemo(() => getUserBranches(me), [me]);
  useEffect(() => {
    if (branchId) return;
    if (!me || userBranches.length === 0) return;
    const last = getLastBranchId(me.id);
    const pick =
      last && userBranches.find((b) => b.id === last) ? last : userBranches[0].id;
    setValue('branchId', pick, { shouldValidate: false });
  }, [me, branchId, userBranches, setValue]);
  useEffect(() => {
    if (me && branchId) setLastBranchId(me.id, branchId);
  }, [me, branchId]);

  // ---- Seguros disponibles del titular ----
  const [availableInsurances, setAvailableInsurances] = useState<
    PatientAvailableInsurance[]
  >([]);
  const [loadingInsurances, setLoadingInsurances] = useState(false);
  useEffect(() => {
    if (!holder || !isInsurance) {
      setAvailableInsurances([]);
      return;
    }
    let cancelled = false;
    setLoadingInsurances(true);
    patientGateway
      .getAvailableInsurances(holder.id)
      .then((list) => {
        if (cancelled) return;
        setAvailableInsurances(list);
        // El seguro elegido pudo dejar de estar disponible (lo quitaron del
        // titular): limpia la selección en vez de guardar algo que el BE
        // rechazará.
        const selIns = getValues('insuranceId');
        const selSrc = getValues('insuranceSource');
        if (selIns && selSrc) {
          const selCtr = getValues('contractorId') || '';
          const ok = list.some(
            (o) =>
              o.insurance.id === selIns &&
              o.source === selSrc &&
              (o.contractor?.id ?? '') === selCtr,
          );
          if (!ok) {
            setValue('insuranceId', '', { shouldDirty: true, shouldValidate: true });
            setValue('insuranceSource', '', {
              shouldDirty: true,
              shouldValidate: true,
            });
            setValue('contractorId', '', { shouldDirty: true });
          }
        }
      })
      .catch(() => !cancelled && setAvailableInsurances([]))
      .finally(() => !cancelled && setLoadingInsurances(false));
    return () => {
      cancelled = true;
    };
  }, [holder, isInsurance, getValues, setValue]);

  const optionKey = (o: PatientAvailableInsurance): string =>
    `${o.source}|${o.insurance.id}|${o.contractor?.id ?? ''}`;
  const currentOptionKey =
    insuranceId && insuranceSource
      ? `${insuranceSource}|${insuranceId}|${contractorId ?? ''}`
      : '';

  // ---- Catálogos ----
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [pathologiesLoading, setPathologiesLoading] = useState(false);
  const [usdRates, setUsdRates] = useState<ExchangeRate[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    serviceTypeGateway
      .listAssignable()
      .then((list) => !cancelled && setServiceTypes(list))
      .catch(() => !cancelled && setServiceTypes([]));
    specialtyGateway
      .listAssignable()
      .then((list) => !cancelled && setSpecialties(list))
      .catch(() => !cancelled && setSpecialties([]));
    setPathologiesLoading(true);
    pathologyGateway
      .listAssignable()
      .then((list) => !cancelled && setPathologies(list))
      .catch(() => !cancelled && setPathologies([]))
      .finally(() => !cancelled && setPathologiesLoading(false));
    exchangeRateGateway
      .list({
        currency: 'USD',
        isActive: true,
        sortBy: 'effectiveDate',
        sortDir: 'DESC',
        page: 1,
        limit: 30,
      })
      .then((res) => !cancelled && setUsdRates(res.data))
      .catch(() => !cancelled && setUsdRates([]));
    // Sólo cuentas de transferencia: el bloque que imprime la plantilla
    // SEGUROS es "banco / RIF / N° de cuenta".
    paymentAccountGateway
      .listAssignable({ type: 'bank_transfer' })
      .then((list) => !cancelled && setAccounts(list))
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Baremo del seguro elegido ----
  const [insurancePrices, setInsurancePrices] = useState<ServicePriceRow[]>([]);
  useEffect(() => {
    if (!isInsurance || !insuranceId) {
      setInsurancePrices([]);
      return;
    }
    let cancelled = false;
    insuranceGateway
      .getById(insuranceId)
      .then((ins) => {
        if (!cancelled) setInsurancePrices(ins.servicePrices ?? []);
      })
      .catch(() => !cancelled && setInsurancePrices([]));
    return () => {
      cancelled = true;
    };
  }, [isInsurance, insuranceId]);

  /** Precio unitario de catálogo por ST: baremo del seguro o Particular. */
  const catalogPriceByST = useMemo(() => {
    const m = new Map<string, number>();
    if (isInsurance) {
      for (const r of insurancePrices) {
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
  }, [isInsurance, insurancePrices, serviceTypes]);

  /**
   * Monto base: suma de los precios de CATÁLOGO de las filas. Es contra esto
   * que se mide el ajuste global y lo que el BE recalcula al guardar — no
   * contra la suma de los precios ya cotizados (que pueden venir ajustados
   * línea a línea).
   */
  const catalogBase = useMemo(() => {
    let cents = 0;
    let complete = serviceRows.length > 0;
    for (const r of serviceRows) {
      const unit = catalogPriceByST.get(r.serviceTypeId);
      if (unit == null) {
        complete = false;
        continue;
      }
      cents += Math.round(unit * 100) * Math.max(1, Math.trunc(r.quantity ?? 1));
    }
    return { sum: cents / 100, complete };
  }, [serviceRows, catalogPriceByST]);

  /** Suma de lo cotizado (precio editado × cantidad). */
  const quotedSum = useMemo(() => {
    const cents = serviceRows.reduce(
      (acc, r) =>
        acc +
        Math.round((r.unitPriceUsd ?? 0) * 100) *
          Math.max(1, Math.trunc(r.quantity ?? 1)),
      0,
    );
    return cents / 100;
  }, [serviceRows]);

  /**
   * El monto total sigue a lo cotizado mientras el usuario no lo toque a mano:
   * cambiar una línea debe moverlo. Se deja de sincronizar en cuanto el monto
   * difiere de la suma anterior por edición manual.
   */
  const lastQuotedRef = useRef<number | null>(null);
  useEffect(() => {
    if (readOnly) return;
    const next = +quotedSum.toFixed(2);
    setValue('priceBaseAmount', catalogBase.complete ? +catalogBase.sum.toFixed(2) : undefined);
    const current = getValues('priceAmount');
    const untouched =
      lastQuotedRef.current === null ||
      Math.round((current ?? 0) * 100) === Math.round(lastQuotedRef.current * 100);
    if (untouched && Math.round((current ?? 0) * 100) !== Math.round(next * 100)) {
      setValue('priceAmount', next, { shouldValidate: true });
    }
    lastQuotedRef.current = next;
  }, [quotedSum, catalogBase, readOnly, setValue, getValues]);

  /** Ajuste global vigente contra el monto base de catálogo. */
  const adjustment = useMemo(() => {
    if (priceBaseAmount === undefined || typeof priceAmount !== 'number') {
      return null;
    }
    const baseCents = Math.round(priceBaseAmount * 100);
    const diffCents = Math.round(priceAmount * 100) - baseCents;
    if (diffCents === 0) return null;
    return {
      amount: diffCents / 100,
      percent: baseCents > 0 ? (diffCents / baseCents) * 100 : null,
      isDiscount: diffCents < 0,
    };
  }, [priceBaseAmount, priceAmount]);

  const branchSelect = (() => {
    if (userBranches.length === 0) {
      return (
        <p className="text-sm italic text-muted-foreground">
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
        onValueChange={(v) =>
          setValue('branchId', v, { shouldDirty: true, shouldValidate: true })
        }
      >
        <SelectTrigger
          className={cn('h-9', errors.branchId?.message && 'border-destructive')}
        >
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

  const rowErrors = (
    errors.serviceTypes as unknown as Array<
      | {
          serviceTypeId?: { message?: string };
          specialtyId?: { message?: string };
          customName?: { message?: string };
          quantity?: { message?: string };
          unitPriceUsd?: { message?: string };
          providerType?: { message?: string };
          doctorId?: { message?: string };
          careCenterId?: { message?: string };
        }
      | undefined
    >
  )?.map?.((e) => ({
    serviceTypeId: e?.serviceTypeId?.message,
    specialtyId: e?.specialtyId?.message,
    customName: e?.customName?.message,
    quantity: e?.quantity?.message,
    unitPriceUsd: e?.unitPriceUsd?.message,
    providerType: e?.providerType?.message,
    doctorId: e?.doctorId?.message,
    careCenterId: e?.careCenterId?.message,
  }));

  return (
    <>
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
        {readOnly ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            El presupuesto ya generó su orden: queda de sólo lectura. Los cambios
            se hacen en la orden.
          </div>
        ) : null}

        <FormSection
          title="Sucursal y tipo"
          description="Dónde se emite el presupuesto y de dónde salen los precios."
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <RequiredLabel required>
                <Building className="mr-1.5 inline h-4 w-4 text-muted-foreground" />
                Sucursal
              </RequiredLabel>
              {branchSelect}
              <FieldError message={errors.branchId?.message} />
            </div>

            <div className="space-y-2">
              <RequiredLabel required>Tipo de presupuesto</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {BUDGET_TYPE_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setValue('type', t, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      if (t === 'particular') {
                        setValue('insuranceId', '', { shouldDirty: true });
                        setValue('insuranceSource', '', { shouldDirty: true });
                        setValue('contractorId', '', { shouldDirty: true });
                      }
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      type === t
                        ? 'border-brand-blue bg-brand-blue-soft'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    {BUDGET_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isInsurance
                  ? 'Los precios salen del baremo del seguro elegido.'
                  : 'Los precios salen del precio Particular del catálogo.'}
              </p>
              <FieldError message={errors.type?.message} />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Titular y paciente"
          description="El titular es a quien se dirige el presupuesto; el paciente puede ser el mismo o un tercero."
          allowOverflow
        >
          <div className="space-y-4">
            {isInsurance ? (
              <div className="flex items-start gap-2 rounded-md border border-dashed bg-brand-blue-soft/40 px-3 py-2 text-xs text-brand-blue-strong">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Sólo se listan pacientes con al menos un seguro asignado (directo
                o vía contratista).
              </div>
            ) : null}
            <PatientSearchSelect
              label="Titular"
              value={holder}
              onChange={onHolderChange}
              required
              error={errors.holderId?.message}
              hasInsuranceAndContractor={isInsurance}
              onCreateClick={
                canCreatePatient
                  ? () => {
                      setCreateTarget('holder');
                      setCreatePatientOpen(true);
                    }
                  : undefined
              }
            />

            <div className="flex items-center gap-2">
              <input
                id="budgetSameAsHolder"
                type="checkbox"
                checked={sameAsHolder}
                onChange={(e) => toggleSameAsHolder(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="budgetSameAsHolder" className="text-sm">
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
                onCreateClick={
                  canCreatePatient
                    ? () => {
                        setCreateTarget('patient');
                        setCreatePatientOpen(true);
                      }
                    : undefined
                }
              />
            ) : null}

            {isInsurance ? (
              <div className="space-y-1.5">
                <RequiredLabel required>Seguro del titular</RequiredLabel>
                <Select
                  value={currentOptionKey}
                  onValueChange={(key) => {
                    if (!key) {
                      setValue('insuranceId', '', {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue('insuranceSource', '', {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue('contractorId', '', { shouldDirty: true });
                      return;
                    }
                    const [src, insId, ctrId] = key.split('|');
                    setValue('insuranceId', insId, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(
                      'insuranceSource',
                      src as 'direct' | 'via_contractor',
                      { shouldDirty: true, shouldValidate: true },
                    );
                    setValue('contractorId', ctrId || '', {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                  disabled={
                    !holder || loadingInsurances || availableInsurances.length === 0
                  }
                >
                  <SelectTrigger
                    className={cn(
                      'h-9',
                      (errors.insuranceId?.message ||
                        errors.insuranceSource?.message) &&
                        'border-destructive',
                    )}
                  >
                    <SelectValue
                      placeholder={
                        !holder
                          ? 'Selecciona un titular primero'
                          : loadingInsurances
                            ? 'Cargando seguros…'
                            : availableInsurances.length === 0
                              ? 'Titular sin seguros disponibles'
                              : 'Selecciona un seguro'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInsurances.map((opt) => (
                      <SelectItem key={optionKey(opt)} value={optionKey(opt)}>
                        {opt.source === 'direct'
                          ? `${opt.insurance.name} (directo)`
                          : `${opt.insurance.name} (vía ${opt.contractor?.name ?? '—'})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError
                  message={
                    errors.insuranceSource?.message ?? errors.insuranceId?.message
                  }
                />
              </div>
            ) : null}
          </div>
        </FormSection>

        <FormSection
          title="Diagnóstico y servicios"
          description="Lo que se presupuesta y a qué precio."
          allowOverflow
        >
          <FormGrid>
            <div className="space-y-1.5 sm:col-span-2">
              <Controller
                control={control}
                name="pathologyIds"
                render={({ field }) => (
                  <ChipMultiSelect
                    label="Patologías (opcional)"
                    value={Array.isArray(field.value) ? field.value : []}
                    onChange={(next) => field.onChange(next)}
                    options={pathologies.map((p) => ({ id: p.id, label: p.name }))}
                    loading={pathologiesLoading}
                    searchPlaceholder="Buscar patología…"
                    emptyLabel="No hay patologías activas."
                    counterSuffix={{
                      singular: 'seleccionada',
                      plural: 'seleccionadas',
                    }}
                  />
                )}
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
                    <Plus className="mr-1 h-3.5 w-3.5" /> Crear patología
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">
                Diagnóstico impreso{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Controller
                control={control}
                name="diagnosisNote"
                render={({ field }) => (
                  <Textarea
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    rows={2}
                    maxLength={500}
                    placeholder="Ej. HTA + trastorno del ritmo + CA de mamas ST I A"
                    className={cn(
                      errors.diagnosisNote?.message && 'border-destructive',
                    )}
                  />
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Sustituye a las patologías en la línea "DIAGNÓSTICO" del
                documento. Vacío ⇒ se imprimen las patologías.
              </p>
              <FieldError message={errors.diagnosisNote?.message} />
            </div>
          </FormGrid>

          <div className="mt-5 space-y-1 border-t border-dashed pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Servicios presupuestados
            </p>
          </div>
          <div className="mt-3">
            <Controller
              control={control}
              name="serviceTypes"
              render={({ field }) => (
                <BudgetServiceTable
                  value={(field.value ?? []) as BudgetServiceRowValue[]}
                  onChange={field.onChange}
                  serviceTypes={serviceTypes}
                  specialties={specialties}
                  errors={rowErrors}
                  disabled={readOnly}
                  priceByServiceTypeId={catalogPriceByST}
                  restrictToPriced={isInsurance && !!insuranceId}
                  initialProviders={initialProviders}
                />
              )}
            />
            {typeof errors.serviceTypes?.message === 'string' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {errors.serviceTypes.message}
              </p>
            )}
          </div>
        </FormSection>

        <FormSection
          title="Vigencia"
          description="Fecha del presupuesto y hasta cuándo se respeta."
        >
          <FormGrid>
            <div className="space-y-1.5">
              <RequiredLabel required>Fecha del presupuesto</RequiredLabel>
              <Controller
                control={control}
                name="budgetDate"
                render={({ field }) => (
                  <DatePicker
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    onBlur={field.onBlur}
                    invalid={!!errors.budgetDate?.message}
                    disableFuture
                  />
                )}
              />
              <FieldError message={errors.budgetDate?.message} />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Válido hasta (opcional)</RequiredLabel>
              <Controller
                control={control}
                name="validUntilDate"
                render={({ field }) => (
                  <DatePicker
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    onBlur={field.onBlur}
                    invalid={!!errors.validUntilDate?.message}
                  />
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Pasada esta fecha el presupuesto se marca vencido mientras siga
                sin aprobarse ni rechazarse.
              </p>
              <FieldError message={errors.validUntilDate?.message} />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Monto"
          description={
            canEditAmount
              ? 'Monto sugerido = suma de los servicios cotizados. Puedes aplicar un descuento o recargo global; el ajuste exige motivo.'
              : 'Suma de los servicios cotizados. No tienes permiso para ajustar el monto.'
          }
        >
          <FormGrid>
            <div className="space-y-1.5">
              <RequiredLabel>Moneda</RequiredLabel>
              <Input readOnly value="USD" className="h-9 bg-muted/30" />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel required>Monto total</RequiredLabel>
              <Controller
                control={control}
                name="priceAmount"
                render={({ field }) => (
                  <CurrencyAmountInput
                    value={
                      typeof field.value === 'number' ? field.value : undefined
                    }
                    onChange={(v) => field.onChange(v ?? 0)}
                    currencyPrefix="USD"
                    readOnly={!canEditAmount || readOnly}
                    className={cn(
                      errors.priceAmount?.message && 'border-destructive',
                    )}
                  />
                )}
              />
              <FieldError message={errors.priceAmount?.message} />
            </div>
          </FormGrid>

          {!catalogBase.complete && serviceRows.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Algún servicio no tiene precio de catálogo: no se compara contra un
              monto base y no se pide motivo de ajuste.
            </p>
          ) : null}

          {adjustment ? (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
                    adjustment.isDiscount
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft text-warning',
                  )}
                >
                  {adjustment.isDiscount ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  {adjustment.isDiscount ? 'Descuento' : 'Recargo'}{' '}
                  {formatMoney(Math.abs(adjustment.amount))} USD
                  {adjustment.percent !== null
                    ? ` (${formatMoney(Math.abs(adjustment.percent))}%)`
                    : ''}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Monto base de catálogo: {formatMoney(priceBaseAmount)} USD
                </span>
              </div>
              <div className="max-w-xl space-y-1.5">
                <RequiredLabel required>Motivo del ajuste</RequiredLabel>
                <Controller
                  control={control}
                  name="priceAdjustmentNote"
                  render={({ field }) => (
                    <Textarea
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      maxLength={500}
                      rows={2}
                      readOnly={!canEditAmount || readOnly}
                      placeholder="Motivo del descuento o del monto superior (convenio, promoción, paquete, etc.)"
                      className={cn(
                        errors.priceAdjustmentNote?.message &&
                          'border-destructive',
                      )}
                    />
                  )}
                />
                <FieldError message={errors.priceAdjustmentNote?.message} />
              </div>
            </div>
          ) : null}
        </FormSection>

        <FormSection
          title="Datos del documento"
          description="Lo que cambia entre las plantillas que se exportan."
          allowOverflow
        >
          <FormGrid>
            <div className="space-y-1.5">
              <RequiredLabel>Tasa BCV del presupuesto</RequiredLabel>
              <Controller
                control={control}
                name="exchangeRateId"
                render={({ field }) => (
                  <Select
                    value={field.value || ''}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tasa vigente a la fecha" />
                    </SelectTrigger>
                    <SelectContent>
                      {usdRates.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {formatMoney(r.amountBs)} Bs ·{' '}
                          {formatDateOnly(r.effectiveDate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Con la que se imprimen los bolívares de la plantilla PACIENTE.
                Sin elegir, se usa la vigente a la fecha del presupuesto
                {budgetDate ? ` (${formatDateOnly(budgetDate)})` : ''}.
              </p>
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Cuenta para el pago del seguro</RequiredLabel>
              <Controller
                control={control}
                name="paymentAccountId"
                render={({ field }) => (
                  <Select
                    value={field.value || ''}
                    onValueChange={(v) => field.onChange(v)}
                    disabled={!isInsurance}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          isInsurance
                            ? 'Sin bloque bancario'
                            : 'Sólo en presupuestos de seguro'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                          {a.accountNumber ? ` · ${a.accountNumber}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Se imprime al pie de la plantilla SEGUROS. Sin cuenta, el
                documento sale sin ese bloque.
              </p>
            </div>

            <div className="space-y-1.5">
              <RequiredLabel>Médico que refiere</RequiredLabel>
              <Controller
                control={control}
                name="referringDoctorName"
                render={({ field }) => (
                  <Input
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={200}
                    placeholder="Nombre del médico"
                    className="h-9"
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel>Especialidad del que refiere</RequiredLabel>
              <Controller
                control={control}
                name="referringSpecialtyName"
                render={({ field }) => (
                  <Input
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={200}
                    placeholder="Ej. Fisioterapia"
                    className="h-9"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <RequiredLabel>Comentarios / observaciones</RequiredLabel>
              <Controller
                control={control}
                name="observations"
                render={({ field }) => (
                  <Textarea
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    rows={2}
                    maxLength={2000}
                    placeholder="Notas para el seguro o el paciente"
                  />
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Médico que refiere, especialidad y observaciones salen en la
                solicitud APS.
              </p>
              <FieldError message={errors.observations?.message} />
            </div>
          </FormGrid>
        </FormSection>
      </fieldset>

      <PatientCreateModal
        open={createPatientOpen}
        onOpenChange={setCreatePatientOpen}
        onCreated={(p) => {
          if (createTarget === 'holder') onHolderChange(p);
          else onPatientChange(p);
          setCreatePatientOpen(false);
        }}
      />
      <PathologyCreateModal
        open={createPathologyOpen}
        onOpenChange={setCreatePathologyOpen}
        onCreated={(p) => {
          setPathologies((prev) => [...prev, p]);
          const current = getValues('pathologyIds') ?? [];
          setValue('pathologyIds', [...current, p.id], { shouldDirty: true });
          setCreatePathologyOpen(false);
        }}
      />
    </>
  );
}
