import { useEffect, useMemo, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CedulaInput } from '@/components/ui/cedula-input';
import { RifInput } from '@/components/ui/rif-input';
import { DatePicker } from '@/components/ui/date-picker';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { ContractorMultiSelect } from '@/components/ui/contractor-multi-select';
import { InsuranceMultiSelect } from '@/components/ui/insurance-multi-select';
import { Badge } from '@/components/ui/badge';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import {
  ConfirmDialog,
} from '@/components/ui/confirm-dialog';
import { AlertTriangle, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { contractorGateway } from '@/modules/contractors/infrastructure/contractorGateway';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';

interface FieldErrorProps {
  message?: string;
}
function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  );
}

export type PatientFormProps = {
  /** Pre-existing contractors (for showing stale chips on edit). */
  existingContractors?: Contractor[];
  /** Pre-existing direct insurances (for showing stale chips on edit). */
  existingDirectInsurances?: Insurance[];
};

export function PatientForm({
  existingContractors,
  existingDirectInsurances,
}: PatientFormProps = {}) {
  const {
    register,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useFormContext<PatientValues>();

  const isActive = watch('isActive') ?? true;
  const phones = watch('phones') ?? [];
  const personType = watch('personType');
  const isLegal = personType === 'legal_entity';
  const contractorIds = watch('contractorIds') ?? [];
  const directInsuranceIds = watch('directInsuranceIds') ?? [];

  // Catálogo de contratistas asignables para mapear ids → insurances.
  const [assignableContractors, setAssignableContractors] = useState<Contractor[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await contractorGateway.listAssignable();
        if (!cancelled) setAssignableContractors(list);
      } catch {
        if (!cancelled) setAssignableContractors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mapa id → contratista (incluye existentes stale, por si están en value).
  const contractorById = useMemo(() => {
    const m = new Map<string, Contractor>();
    for (const c of existingContractors ?? []) m.set(c.id, c);
    for (const c of assignableContractors) m.set(c.id, c);
    return m;
  }, [existingContractors, assignableContractors]);

  // Seguros cubiertos por los contratistas seleccionados, con el contratista que los cubre.
  const coveredByContractor = useMemo(() => {
    const map = new Map<string, { insurance: Insurance; contractor: Contractor }>();
    for (const cid of contractorIds) {
      const c = contractorById.get(cid);
      if (!c) continue;
      for (const ins of c.insurances ?? []) {
        if (!map.has(ins.id)) map.set(ins.id, { insurance: ins, contractor: c });
      }
    }
    return map;
  }, [contractorIds, contractorById]);

  // disabledOptions para InsuranceMultiSelect de directos.
  const disabledDirectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const [insId, { contractor }] of coveredByContractor.entries()) {
      m.set(insId, `Ya cubierto por el contratista "${contractor.name}"`);
    }
    return m;
  }, [coveredByContractor]);

  // Aviso al usuario cuando un seguro directo ya seleccionado pasa a estar cubierto por un contratista.
  const [warnedConflictIds, setWarnedConflictIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const conflicts = directInsuranceIds.filter((id) => coveredByContractor.has(id));
    if (!conflicts.length) {
      if (warnedConflictIds.size) setWarnedConflictIds(new Set());
      return;
    }
    const newOnes = conflicts.filter((id) => !warnedConflictIds.has(id));
    if (!newOnes.length) return;
    for (const id of newOnes) {
      const entry = coveredByContractor.get(id);
      if (!entry) continue;
      notify.warning(
        `El seguro "${entry.insurance.name}" ahora está cubierto por el contratista "${entry.contractor.name}". Quitalo de los seguros directos para evitar el conflicto al guardar.`,
      );
    }
    setWarnedConflictIds((prev) => {
      const next = new Set(prev);
      for (const id of newOnes) next.add(id);
      return next;
    });
  }, [directInsuranceIds, coveredByContractor, warnedConflictIds]);

  // Resumen calculado: directos + vía contratista, dedup por seguro (directo gana).
  const availableSummary = useMemo(() => {
    type Row = { id: string; name: string; source: 'direct' | 'via_contractor'; contractorName?: string };
    const map = new Map<string, Row>();
    // Directos primero (incluye existing stale por si están en value)
    const directLookup = new Map<string, Insurance>();
    for (const ins of existingDirectInsurances ?? []) directLookup.set(ins.id, ins);
    for (const id of directInsuranceIds) {
      const ins = directLookup.get(id);
      if (ins) {
        map.set(id, { id, name: ins.name, source: 'direct' });
      } else {
        map.set(id, { id, name: id.slice(0, 6) + '…', source: 'direct' });
      }
    }
    for (const [insId, { insurance, contractor }] of coveredByContractor.entries()) {
      if (map.has(insId)) continue;
      map.set(insId, {
        id: insId,
        name: insurance.name,
        source: 'via_contractor',
        contractorName: contractor.name,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [directInsuranceIds, existingDirectInsurances, coveredByContractor]);

  const phoneErrors = (errors.phones as unknown as Array<{ number?: { message?: string } } | undefined>)?.map?.(
    (e) => (e?.number ? { number: e.number.message } : undefined),
  );

  const invalid = (k: keyof PatientValues) =>
    (errors as Record<string, unknown>)[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const [pendingType, setPendingType] = useState<'natural' | 'legal_entity' | null>(null);

  const hasDataInOppositeType = (target: 'natural' | 'legal_entity') => {
    const v = getValues();
    if (target === 'legal_entity') {
      return !!(v.cedula || v.firstName || v.lastName);
    }
    return !!(v.businessName || v.rif);
  };

  const applyType = (target: 'natural' | 'legal_entity') => {
    setValue('personType', target, { shouldDirty: true, shouldValidate: false });
    if (target === 'natural') {
      setValue('businessName', '', { shouldValidate: false });
      setValue('rif', '', { shouldValidate: false });
    } else {
      setValue('cedula', '', { shouldValidate: false });
      setValue('firstName', '', { shouldValidate: false });
      setValue('lastName', '', { shouldValidate: false });
    }
  };

  const onSelectType = (target: 'natural' | 'legal_entity') => {
    if (target === personType) return;
    if (hasDataInOppositeType(target)) {
      setPendingType(target);
      return;
    }
    applyType(target);
  };

  return (
    <div className="space-y-6">
      <FormSection
        title="Tipo de persona"
        description="Elegí si el paciente es una persona natural o jurídica. Esto cambia los datos de identificación que se piden."
      >
        <div className="inline-flex rounded-lg border bg-muted/30 p-1 gap-1">
          <button
            type="button"
            onClick={() => onSelectType('natural')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              personType === 'natural'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <User className="w-4 h-4" /> Persona natural
          </button>
          <button
            type="button"
            onClick={() => onSelectType('legal_entity')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              personType === 'legal_entity'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Building2 className="w-4 h-4" /> Persona jurídica
          </button>
        </div>
      </FormSection>

      <FormSection
        title={isLegal ? 'Información de la empresa' : 'Información personal'}
        description={
          isLegal
            ? 'Razón social, RIF y datos de contacto.'
            : 'Datos básicos de identificación del paciente.'
        }
      >
        <FormGrid>
          {isLegal ? (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="businessName" className="text-sm font-medium">
                  Razón social <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="businessName"
                  {...register('businessName')}
                  className={cn('h-9', invalid('businessName'))}
                />
                <FieldError message={errors.businessName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rif" className="text-sm font-medium">
                  RIF <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="rif"
                  control={control}
                  render={({ field }) => (
                    <RifInput
                      id="rif"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!errors.rif}
                    />
                  )}
                />
                <FieldError message={errors.rif?.message} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cedula" className="text-sm font-medium">
                  Cédula <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="cedula"
                  control={control}
                  render={({ field }) => (
                    <CedulaInput
                      id="cedula"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!errors.cedula}
                    />
                  )}
                />
                <FieldError message={errors.cedula?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-sm font-medium">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  {...register('firstName')}
                  className={cn('h-9', invalid('firstName'))}
                />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-sm font-medium">
                  Apellido <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  {...register('lastName')}
                  className={cn('h-9', invalid('lastName'))}
                />
                <FieldError message={errors.lastName?.message} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className={cn('h-9', invalid('email'))}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birthDate" className="text-sm font-medium">
              Fecha de nacimiento <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="birthDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  id="birthDate"
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  onBlur={field.onBlur}
                  invalid={!!errors.birthDate}
                  disableFuture
                />
              )}
            />
            <FieldError message={errors.birthDate?.message} />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="Dirección" description="Domicilio actual del paciente.">
        <div className="space-y-1.5">
          <Label htmlFor="address" className="text-sm font-medium">
            Dirección <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="address"
            rows={2}
            {...register('address')}
            className={invalid('address')}
          />
          <FieldError message={errors.address?.message} />
        </div>
      </FormSection>

      <FormSection
        title="Teléfonos"
        description="Opcional. Hasta 10. Cada número con exactamente 11 dígitos."
      >
        <Controller
          name="phones"
          control={control}
          render={({ field }) => (
            <PhoneListInput
              value={field.value ?? []}
              onChange={field.onChange}
              errors={phoneErrors}
              arrayError={
                typeof errors.phones?.message === 'string' ? errors.phones.message : undefined
              }
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Contratistas"
        description="Asigná uno o más contratistas al paciente. Cada contratista aporta sus propios seguros."
      >
        <Controller
          name="contractorIds"
          control={control}
          render={({ field }) => (
            <ContractorMultiSelect
              value={field.value ?? []}
              onChange={field.onChange}
              existing={existingContractors}
              error={
                typeof errors.contractorIds?.message === 'string'
                  ? errors.contractorIds.message
                  : undefined
              }
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Seguros directos"
        description="Seguros asignados directamente al paciente (sin contratista). No podés elegir seguros ya cubiertos por algún contratista seleccionado."
      >
        <Controller
          name="directInsuranceIds"
          control={control}
          render={({ field }) => (
            <InsuranceMultiSelect
              label="Seguros directos"
              value={field.value ?? []}
              onChange={field.onChange}
              existing={existingDirectInsurances}
              disabledOptions={disabledDirectOptions}
              error={
                typeof errors.directInsuranceIds?.message === 'string'
                  ? errors.directInsuranceIds.message
                  : undefined
              }
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Seguros disponibles totales"
        description="Resumen calculado: unión de seguros directos y los aportados por los contratistas seleccionados."
      >
        {availableSummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin seguros disponibles. Asigná un contratista o un seguro directo.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableSummary.map((row) => (
              <span
                key={`${row.id}-${row.source}`}
                className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs bg-card"
              >
                <span className="font-medium text-foreground">{row.name}</span>
                {row.source === 'direct' ? (
                  <Badge variant="outline" className="text-[10px]">Directo</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Vía {row.contractorName}
                  </Badge>
                )}
              </span>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Estado">
        <FormSwitch
          label="Habilitado"
          description="Si está deshabilitado, el paciente no aparecerá como activo en listados."
          checked={!!isActive}
          onCheckedChange={(v) =>
            setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
          }
        />
      </FormSection>

      <p className="text-xs text-muted-foreground">
        Tenés <strong>{phones.length}</strong> teléfono{phones.length === 1 ? '' : 's'} cargado
        {phones.length === 1 ? '' : 's'}.
      </p>

      <ConfirmDialog
        open={!!pendingType}
        onOpenChange={(open) => {
          if (!open) setPendingType(null);
        }}
        tone="warning"
        icon={AlertTriangle}
        title="¿Cambiar tipo de persona?"
        description={
          <>
            Los datos cargados del tipo anterior se borrarán. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Cambiar tipo"
        confirmVariant="destructive"
        onConfirm={() => {
          if (pendingType) applyType(pendingType);
          setPendingType(null);
        }}
      />
    </div>
  );
}
