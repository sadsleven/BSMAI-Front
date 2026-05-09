import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { serviceTypeGateway } from '../../infrastructure/serviceTypeGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { serviceTypeSchema, type ServiceTypeValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ServiceTypePricesInput,
  pricesToPayload,
  type ServiceTypePricesValue,
} from '../components/ServiceTypePricesInput';

export function ServiceTypeCreate() {
  const navigate = useNavigate();
  const [priceRows, setPriceRows] = useState<ServiceTypePricesValue['rows']>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ServiceTypeValues>({
    resolver: zodResolver(serviceTypeSchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', isActive: true },
  });

  const isActive = watch('isActive') ?? true;
  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const onSubmit = async (values: ServiceTypeValues) => {
    try {
      await serviceTypeGateway.create({
        name: values.name,
        description: values.description || undefined,
        isActive: values.isActive,
        prices: pricesToPayload(priceRows),
      });
      notify.success('Tipo de servicio creado exitosamente');
      navigate('/service-types');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el tipo de servicio.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" noValidate>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Nuevo tipo de servicio
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/service-types')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a tipos de servicio
          </button>
        </div>

        <FormSection title="Información" description="Nombre visible y descripción opcional.">
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
          title="Precios"
          description="Asigná precio en USD y/o EUR para cada seguro y para órdenes Particular (sin seguro). Dejá un campo vacío si no aplica."
        >
          <ServiceTypePricesInput value={priceRows} onChange={setPriceRows} />
        </FormSection>

        <FormSection title="Estado">
          <FormSwitch
            label="Habilitada"
            description="Si está deshabilitada, no aparecerá como opción al asignar tipos de servicio."
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
            <Button type="button" variant="outline" onClick={() => navigate('/service-types')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear tipo de servicio'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
