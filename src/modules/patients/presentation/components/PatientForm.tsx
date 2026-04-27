import { Controller, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CedulaInput } from '@/components/ui/cedula-input';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientValues } from '@/lib/validations/schemas';

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

export function PatientForm() {
  const {
    register,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<PatientValues>();

  const isActive = watch('isActive') ?? true;
  const phones = watch('phones') ?? [];

  const phoneErrors = (errors.phones as unknown as Array<{ number?: { message?: string } } | undefined>)?.map?.(
    (e) => (e?.number ? { number: e.number.message } : undefined),
  );

  const invalid = (k: keyof PatientValues) =>
    (errors as Record<string, unknown>)[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  return (
    <div className="space-y-6">
      <FormSection
        title="Información personal"
        description="Datos básicos de identificación del paciente."
      >
        <FormGrid>
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
            <Label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
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
          <div className="space-y-1.5">
            <Label htmlFor="birthDate" className="text-sm font-medium">
              Fecha de nacimiento <span className="text-destructive">*</span>
            </Label>
            <Input
              id="birthDate"
              type="date"
              {...register('birthDate')}
              className={cn('h-9', invalid('birthDate'))}
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
        description="Mínimo 1, máximo 10. Cada número con exactamente 11 dígitos."
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
    </div>
  );
}
