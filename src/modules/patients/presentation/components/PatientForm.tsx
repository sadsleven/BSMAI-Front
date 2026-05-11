import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CedulaInput } from '@/components/ui/cedula-input';
import { RifInput } from '@/components/ui/rif-input';
import { DatePicker } from '@/components/ui/date-picker';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { ContractorMultiSelect } from '@/components/ui/contractor-multi-select';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import {
  ConfirmDialog,
} from '@/components/ui/confirm-dialog';
import { AlertTriangle, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientValues } from '@/lib/validations/schemas';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

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
};

export function PatientForm({
  existingContractors,
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
        description="Asigná uno o más contratistas al paciente. Los seguros del paciente se derivan de los contratistas asociados."
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
