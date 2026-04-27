import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { careCenterGateway } from '../../infrastructure/careCenterGateway';
import type { CareCenterPaymentMethod } from '../../domain/models/careCenter';
import { Button } from '@/components/ui/button';
import { CareCenterForm } from '../components/CareCenterForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  careCenterSchema,
  type CareCenterValues,
  type PaymentMethodValues,
} from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { ChevronLeft } from 'lucide-react';

function cleanPaymentMethod(m: PaymentMethodValues): CareCenterPaymentMethod {
  const base: CareCenterPaymentMethod = {
    type: m.type,
    isActive: m.isActive ?? true,
  };
  if (m.type === 'mobile_payment') {
    base.bankCode = m.bankCode || null;
    base.phoneNumber = m.phoneNumber || null;
    base.idDocument = m.idDocument || null;
  } else if (m.type === 'bank_transfer') {
    base.bankCode = m.bankCode || null;
    base.accountNumber = m.accountNumber || null;
    base.accountHolderName = m.accountHolderName || null;
    base.idDocument = m.idDocument || null;
  } else {
    base.description = m.description || null;
  }
  return base;
}

export function CareCenterCreate() {
  const navigate = useNavigate();

  const methods = useForm<CareCenterValues>({
    resolver: zodResolver(careCenterSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      email: '',
      rif: '',
      phones: [{ number: '', label: '' }],
      specialtyIds: [],
      paymentMethods: [],
      isActive: true,
    },
  });

  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: CareCenterValues) => {
    try {
      await careCenterGateway.create({
        name: values.name,
        email: values.email,
        rif: values.rif,
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        specialtyIds: values.specialtyIds,
        paymentMethods: (values.paymentMethods ?? []).map(cleanPaymentMethod),
        isActive: values.isActive,
      });
      notify.success('Centro creado exitosamente');
      navigate('/care-centers');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el centro.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Nuevo centro de atención
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/care-centers')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a centros
            </button>
          </div>

          <CareCenterForm />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/care-centers')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Creando…' : 'Crear centro'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
