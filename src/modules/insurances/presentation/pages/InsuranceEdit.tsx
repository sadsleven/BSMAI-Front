import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insuranceGateway } from '../../infrastructure/insuranceGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PhoneListInput } from '@/components/ui/phone-list-input';
import { RifInput } from '@/components/ui/rif-input';
import {
  ServicePricesTable,
  servicePricesToPayload,
} from '@/components/ui/service-prices-table';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { insuranceSchema, type InsuranceValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function InsuranceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');

  const methods = useForm<InsuranceValues>({
    resolver: zodResolver(insuranceSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      description: '',
      email: '',
      fiscalAddress: '',
      rif: '',
      phones: [],
      servicePrices: [],
      isActive: true,
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = methods;

  const isActive = watch('isActive') ?? true;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const i = await insuranceGateway.getById(id);
        reset({
          name: i.name,
          description: i.description ?? '',
          email: i.email ?? '',
          fiscalAddress: i.fiscalAddress ?? '',
          rif: i.rif ?? '',
          phones:
            i.phones?.length > 0
              ? i.phones.map((ph) => ({ number: ph.number, label: ph.label ?? '' }))
              : [],
          servicePrices: (i.servicePrices ?? []).map((sp) => ({
            serviceTypeId: sp.serviceTypeId,
            serviceType: sp.serviceType
              ? { id: sp.serviceType.id, name: sp.serviceType.name }
              : undefined,
            priceUsd: Number(sp.priceUsd) || 0,
          })),
          isActive: i.isActive ?? true,
        });
        setDisplayName(i.name);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el seguro.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: InsuranceValues) => {
    if (!id) return;
    try {
      await insuranceGateway.update(id, {
        name: values.name,
        description: values.description ?? undefined,
        email: values.email?.trim() || '',
        fiscalAddress: values.fiscalAddress?.trim() ?? '',
        rif: values.rif?.trim() ?? '',
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        servicePrices: servicePricesToPayload(values.servicePrices ?? []),
        isActive: values.isActive,
      });
      notify.success('Seguro actualizado');
      navigate('/insurances');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el seguro.');
    }
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando seguro…</div>;
  }

  const invalid = (
    k: 'name' | 'description' | 'email' | 'fiscalAddress' | 'rif',
  ) => (errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '');

  const phoneErrors = (
    errors.phones as unknown as Array<{ number?: { message?: string } } | undefined>
  )?.map?.((e) => (e?.number ? { number: e.number.message } : undefined));

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" noValidate>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar seguro
              </h1>
              {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/insurances')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a seguros
            </button>
          </div>

          <FormSection title="Información">
            <FormGrid>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input id="name" {...register('name')} className={cn('h-9', invalid('name'))} />
                {errors.name ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  className={cn('h-9', invalid('email'))}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="fiscalAddress" className="text-sm font-medium">
                  Dirección fiscal <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Textarea
                  id="fiscalAddress"
                  rows={2}
                  {...register('fiscalAddress')}
                  className={invalid('fiscalAddress')}
                />
                {errors.fiscalAddress ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.fiscalAddress.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rif" className="text-sm font-medium">
                  RIF <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Controller
                  name="rif"
                  control={control}
                  render={({ field }) => (
                    <RifInput
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      invalid={!!errors.rif}
                    />
                  )}
                />
                {errors.rif ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.rif.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  Descripción
                </Label>
                <Textarea
                  id="description"
                  rows={3}
                  {...register('description')}
                  className={invalid('description')}
                />
                {errors.description ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.description.message}
                  </p>
                ) : null}
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
                    typeof errors.phones?.message === 'string'
                      ? errors.phones.message
                      : undefined
                  }
                />
              )}
            />
          </FormSection>

          <FormSection
            title="Precios de Cobro por Tipo de Servicio"
            description="Estos son los montos que el seguro paga por cada servicio."
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

          <FormSection title="Estado">
            <FormSwitch
              label="Habilitado"
              description="Si está deshabilitado, no aparecerá como opción al asignar seguros."
              checked={isActive}
              onCheckedChange={(v) =>
                setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
              }
            />
          </FormSection>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/insurances')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
