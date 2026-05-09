import { Controller, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RifInput } from '@/components/ui/rif-input';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { SpecialtyMultiSelect } from '@/components/ui/specialty-multi-select';
import {
  PaymentMethodsInput,
  type PaymentMethodErrors,
} from '@/components/ui/payment-methods-input';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CareCenterValues,
  PaymentMethodValues,
} from '@/lib/validations/schemas';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  );
}

export type CareCenterFormProps = {
  existingSpecialties?: Specialty[];
};

export function CareCenterForm({ existingSpecialties }: CareCenterFormProps) {
  const {
    register,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<CareCenterValues>();

  const isActive = watch('isActive') ?? true;
  const phones = watch('phones') ?? [];
  const rif = watch('rif');
  const businessName = watch('businessName');

  const phoneErrors = (
    errors.phones as unknown as Array<{ number?: { message?: string } } | undefined>
  )?.map?.((e) => (e?.number ? { number: e.number.message } : undefined));

  const paymentErrors = (
    errors.paymentMethods as unknown as
      | Array<Record<string, { message?: string } | undefined> | undefined>
      | undefined
  )?.map<PaymentMethodErrors>((e) =>
    e
      ? Object.fromEntries(
          Object.entries(e).map(([k, v]) => [k, v?.message]),
        ) as PaymentMethodErrors
      : undefined,
  );

  const invalid = (k: keyof CareCenterValues) =>
    (errors as Record<string, unknown>)[k]
      ? 'border-destructive focus-visible:ring-destructive/30'
      : '';

  return (
    <div className="space-y-6">
      <FormSection
        title="Datos del centro"
        description="Información de identificación del centro de atención."
      >
        <FormGrid>
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
            <Label htmlFor="rif" className="text-sm font-medium">
              RIF <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
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
        </FormGrid>
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
        title="Especialidades"
        description="Asigná al menos una especialidad clínica que se atiende en el centro."
      >
        <Controller
          name="specialtyIds"
          control={control}
          render={({ field }) => (
            <SpecialtyMultiSelect
              value={field.value ?? []}
              onChange={field.onChange}
              existing={existingSpecialties}
              error={
                typeof errors.specialtyIds?.message === 'string'
                  ? errors.specialtyIds.message
                  : undefined
              }
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Métodos de pago"
        description="Pago móvil, transferencia o método libre. Los datos se autocompletan desde el centro pero podés editarlos."
      >
        <Controller
          name="paymentMethods"
          control={control}
          render={({ field }) => (
            <PaymentMethodsInput
              value={(field.value ?? []) as PaymentMethodValues[]}
              onChange={field.onChange}
              errors={paymentErrors}
              arrayError={
                typeof errors.paymentMethods?.message === 'string'
                  ? errors.paymentMethods.message
                  : undefined
              }
              defaults={{
                rif: rif || null,
                fullName: businessName,
                firstPhone: phones[0]?.number,
              }}
            />
          )}
        />
      </FormSection>

      <FormSection title="Estado">
        <FormSwitch
          label="Habilitado"
          description="Si está deshabilitado, el centro no aparecerá como activo en listados."
          checked={!!isActive}
          onCheckedChange={(v) =>
            setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
          }
        />
      </FormSection>
    </div>
  );
}
