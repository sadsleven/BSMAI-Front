import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doctorGateway } from '../../infrastructure/doctorGateway';
import type { DoctorPaymentMethod } from '../../domain/models/doctor';
import { Button } from '@/components/ui/button';
import { DoctorForm } from '../components/DoctorForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  doctorSchema,
  type DoctorValues,
  type PaymentMethodValues,
} from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { servicePricesToPayload } from '@/components/ui/service-prices-table';
import { ChevronLeft } from 'lucide-react';

function cleanPaymentMethod(m: PaymentMethodValues): DoctorPaymentMethod {
  const base: DoctorPaymentMethod = {
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

export function DoctorCreate() {
  const navigate = useNavigate();

  const methods = useForm<DoctorValues>({
    resolver: zodResolver(doctorSchema),
    mode: 'onBlur',
    defaultValues: {
      cedula: '',
      email: '',
      firstName: '',
      lastName: '',
      isLegalEntity: false,
      rif: '',
      phones: [],
      specialtyIds: [],
      paymentMethods: [],
      servicePrices: [],
      isActive: true,
    },
  });

  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: DoctorValues) => {
    try {
      await doctorGateway.create({
        cedula: values.cedula,
        email: values.email?.trim() || undefined,
        firstName: values.firstName,
        lastName: values.lastName,
        isLegalEntity: values.isLegalEntity,
        rif: values.isLegalEntity ? values.rif || undefined : undefined,
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        specialtyIds: values.specialtyIds,
        paymentMethods: (values.paymentMethods ?? []).map(cleanPaymentMethod),
        servicePrices: servicePricesToPayload(values.servicePrices ?? []),
        isActive: values.isActive,
      });
      notify.success('Doctor creado exitosamente');
      navigate('/doctors');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el doctor.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Nuevo doctor
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/doctors')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a doctores
            </button>
          </div>

          <DoctorForm />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/doctors')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Creando…' : 'Crear doctor'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
