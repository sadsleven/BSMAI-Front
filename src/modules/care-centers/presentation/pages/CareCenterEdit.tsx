import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { careCenterGateway } from '../../infrastructure/careCenterGateway';
import type { CareCenterPaymentMethod } from '../../domain/models/careCenter';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import { Button } from '@/components/ui/button';
import { CareCenterForm } from '../components/CareCenterForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import {
  careCenterSchema,
  type CareCenterValues,
  type PaymentMethodValues,
} from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft } from 'lucide-react';

function cleanPaymentMethod(m: PaymentMethodValues): CareCenterPaymentMethod {
  const base: CareCenterPaymentMethod = {
    type: m.type,
    isActive: m.isActive ?? true,
  };
  if (m.id) base.id = m.id;
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

export function CareCenterEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [existingSpecialties, setExistingSpecialties] = useState<Specialty[]>([]);

  const methods = useForm<CareCenterValues>({
    resolver: zodResolver(careCenterSchema),
    mode: 'onBlur',
    defaultValues: {
      businessName: '',
      email: '',
      rif: '',
      phones: [],
      specialtyIds: [],
      paymentMethods: [],
      isActive: true,
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const c = await careCenterGateway.getById(id);
        methods.reset({
          businessName: c.businessName,
          email: c.email ?? '',
          rif: c.rif ?? '',
          phones:
            c.phones?.length > 0
              ? c.phones.map((ph) => ({ number: ph.number, label: ph.label ?? '' }))
              : [],
          specialtyIds: (c.specialties ?? []).map((s) => s.id),
          paymentMethods: (c.paymentMethods ?? []).map((m) => ({
            id: m.id,
            type: m.type,
            isActive: m.isActive ?? true,
            bankCode: m.bankCode ?? '',
            phoneNumber: m.phoneNumber ?? '',
            idDocument: m.idDocument ?? '',
            accountNumber: m.accountNumber ?? '',
            accountHolderName: m.accountHolderName ?? '',
            description: m.description ?? '',
          })),
          isActive: c.isActive,
        });
        setDisplayName(c.businessName);
        setExistingSpecialties(c.specialties ?? []);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el centro.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: CareCenterValues) => {
    if (!id) return;
    try {
      await careCenterGateway.update(id, {
        businessName: values.businessName,
        email: values.email?.trim() || '',
        rif: values.rif?.trim() || '',
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        specialtyIds: values.specialtyIds,
        paymentMethods: (values.paymentMethods ?? []).map(cleanPaymentMethod),
        isActive: values.isActive,
      });
      notify.success('Centro actualizado');
      navigate('/care-centers');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el centro.');
    }
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando centro…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar centro
              </h1>
              {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/care-centers')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a centros
            </button>
          </div>

          <CareCenterForm existingSpecialties={existingSpecialties} />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/care-centers')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={methods.formState.isSubmitting}>
                {methods.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
