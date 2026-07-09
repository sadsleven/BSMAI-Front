import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doctorGateway } from '../../infrastructure/doctorGateway';
import { fullName, type DoctorPaymentMethod } from '../../domain/models/doctor';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import { Button } from '@/components/ui/button';
import { DoctorForm } from '../components/DoctorForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
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

export function DoctorEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [existingSpecialties, setExistingSpecialties] = useState<Specialty[]>([]);
  const [accountExists, setAccountExists] = useState(false);

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
      centerAddress: '',
      phones: [],
      specialtyIds: [],
      paymentMethods: [],
      servicePrices: [],
      isActive: true,
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await doctorGateway.getById(id);
        methods.reset({
          cedula: d.cedula,
          email: d.email ?? '',
          firstName: d.firstName,
          lastName: d.lastName,
          isLegalEntity: d.isLegalEntity,
          rif: d.rif ?? '',
          centerAddress: d.centerAddress ?? '',
          phones:
            d.phones?.length > 0
              ? d.phones.map((ph) => ({ number: ph.number, label: ph.label ?? '' }))
              : [],
          specialtyIds: (d.specialties ?? []).map((s) => s.id),
          paymentMethods: (d.paymentMethods ?? []).map((m) => ({
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
          servicePrices: (d.servicePrices ?? []).map((sp) => ({
            serviceTypeId: sp.serviceTypeId,
            serviceType: sp.serviceType
              ? { id: sp.serviceType.id, name: sp.serviceType.name }
              : undefined,
            priceUsd: Number(sp.priceUsd) || 0,
          })),
          isActive: d.isActive,
          password: '',
          confirmPassword: '',
        });
        setDisplayName(fullName(d));
        setExistingSpecialties(d.specialties ?? []);
        setAccountExists(!!d.userId);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el doctor.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: DoctorValues) => {
    if (!id) return;
    try {
      await doctorGateway.update(id, {
        cedula: values.cedula,
        email: values.email?.trim() ?? '',
        firstName: values.firstName,
        lastName: values.lastName,
        isLegalEntity: values.isLegalEntity,
        rif: values.isLegalEntity ? values.rif || undefined : undefined,
        centerAddress: values.centerAddress?.trim() ?? '',
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        specialtyIds: values.specialtyIds,
        paymentMethods: (values.paymentMethods ?? []).map(cleanPaymentMethod),
        servicePrices: servicePricesToPayload(values.servicePrices ?? []),
        isActive: values.isActive,
        password: values.password?.trim() || undefined,
      });
      notify.success('Doctor actualizado');
      navigate('/doctors');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el doctor.');
    }
  };

  if (fetching) {
    return <PageLoader label="Cargando doctor…" />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" autoComplete="off">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar doctor
              </h1>
              {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/doctors')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a doctores
            </button>
          </div>

          <DoctorForm
            existingSpecialties={existingSpecialties}
            mode="edit"
            accountExists={accountExists}
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/doctors')}>
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
