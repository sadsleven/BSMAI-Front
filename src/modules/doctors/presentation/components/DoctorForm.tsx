import { Controller, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CedulaInput } from '@/components/ui/cedula-input';
import { RifInput } from '@/components/ui/rif-input';
import { PasswordInput } from '@/components/ui/password-input';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { SpecialtyMultiSelect } from '@/components/ui/specialty-multi-select';
import {
  PaymentMethodsInput,
  type PaymentMethodErrors,
} from '@/components/ui/payment-methods-input';
import {
  ServicePricesTable,
} from '@/components/ui/service-prices-table';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { AlertTriangle, KeyRound, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DoctorValues, PaymentMethodValues } from '@/lib/validations/schemas';
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

export type DoctorFormProps = {
  /** Especialidades existentes para mantener chips deshabilitados quitables. */
  existingSpecialties?: Specialty[];
  /** Modo del formulario; gobierna la sección de acceso. */
  mode?: 'create' | 'edit';
  /** En edición: si el doctor ya tiene cuenta de acceso (userId). */
  accountExists?: boolean;
  /** En edición: callback para abrir el cambio de contraseña. */
  onChangePassword?: () => void;
  /** Permiso para cambiar/establecer la contraseña (controla el botón en edición). */
  canChangePassword?: boolean;
};

export function DoctorForm({
  existingSpecialties,
  mode = 'create',
  accountExists = false,
  onChangePassword,
  canChangePassword = false,
}: DoctorFormProps) {
  const {
    register,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<DoctorValues>();

  const isLegalEntity = watch('isLegalEntity');
  const isActive = watch('isActive') ?? true;
  const phones = watch('phones') ?? [];
  const cedula = watch('cedula');
  const rif = watch('rif');
  const firstName = watch('firstName');
  const lastName = watch('lastName');

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

  const invalid = (k: keyof DoctorValues) =>
    (errors as Record<string, unknown>)[k]
      ? 'border-destructive focus-visible:ring-destructive/30'
      : '';

  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();

  return (
    <div className="space-y-6">
      <FormSection
        title="Datos personales"
        description="Información de identificación y contacto del doctor."
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
        </FormGrid>
      </FormSection>

      <FormSection
        title="Persona jurídica"
        description="Activá si el doctor opera como empresa o entidad. El RIF es obligatorio en ese caso."
      >
        <FormSwitch
          label="Es persona jurídica"
          description="Si está activado, debe ingresarse un RIF."
          checked={!!isLegalEntity}
          onCheckedChange={(v) => {
            setValue('isLegalEntity', v, { shouldDirty: true, shouldValidate: true });
            if (!v) setValue('rif', '', { shouldDirty: true });
          }}
        />
        {isLegalEntity && (
          <div className="space-y-1.5 mt-4 max-w-md">
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
        )}
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
        description="Asigná al menos una especialidad clínica."
        allowOverflow
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
        description="Pago móvil, transferencia o método libre. Los datos se autocompletan desde el doctor pero podés editarlos manualmente."
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
                cedula,
                rif: rif || null,
                fullName,
                firstPhone: phones[0]?.number,
              }}
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Precios de Pago por Tipo de Servicio"
        description="Estos son los montos que se le pagan al doctor por cada servicio realizado."
      >
        <Controller
          name="servicePrices"
          control={control}
          render={({ field }) => {
            const rowErrors = (
              errors.servicePrices as unknown as Array<
                | {
                    serviceTypeId?: { message?: string };
                    priceUsd?: { message?: string };
                  }
                | undefined
              >
            )?.map?.((e) => ({
              serviceTypeId: e?.serviceTypeId?.message,
              priceUsd: e?.priceUsd?.message,
            }));
            return (
              <ServicePricesTable
                value={field.value ?? []}
                onChange={field.onChange}
                errors={rowErrors}
              />
            );
          }}
        />
      </FormSection>

      <FormSection
        title="Acceso al sistema"
        description="Habilitá que el doctor inicie sesión como usuario proveedor para cargar el informe (Paso 3) de sus órdenes."
      >
        {mode === 'create' ? (
          <FormGrid>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">
                Contraseña{' '}
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <PasswordInput
                id="password"
                {...register('password')}
                className={cn('h-9', invalid('password'))}
              />
              <FieldError message={errors.password?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmar contraseña
              </Label>
              <PasswordInput
                id="confirmPassword"
                {...register('confirmPassword')}
                className={cn('h-9', invalid('confirmPassword'))}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Dejá la contraseña vacía si el doctor no necesita acceso. Si la definís, el
              email pasa a ser su usuario. Mínimo 8 caracteres con mayúscula, minúscula,
              número y carácter especial.
            </p>
          </FormGrid>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {accountExists ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <ShieldCheck className="w-4 h-4" /> Acceso habilitado
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Sin acceso. Establecé una contraseña para habilitarlo.
                </span>
              )}
            </div>
            {canChangePassword && onChangePassword ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onChangePassword}
                className="gap-1.5"
              >
                <KeyRound className="w-4 h-4" />
                {accountExists ? 'Cambiar contraseña' : 'Establecer contraseña'}
              </Button>
            ) : null}
          </div>
        )}
      </FormSection>

      <FormSection title="Estado">
        <FormSwitch
          label="Habilitado"
          description="Si está deshabilitado, el doctor no aparecerá como activo en listados."
          checked={!!isActive}
          onCheckedChange={(v) =>
            setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
          }
        />
      </FormSection>
    </div>
  );
}
