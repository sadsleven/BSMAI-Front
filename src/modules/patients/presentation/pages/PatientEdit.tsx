import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientGateway } from '../../infrastructure/patientGateway';
import { displayName } from '../../domain/models/patient';
import type { UpdatePatientDto } from '../../domain/models/patient';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import { Button } from '@/components/ui/button';
import { PatientForm } from '../components/PatientForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { patientSchema, type PatientValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft } from 'lucide-react';

export function PatientEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [headerLabel, setHeaderLabel] = useState('');
  const [existingContractors, setExistingContractors] = useState<Contractor[]>([]);
  const [existingDirectInsurances, setExistingDirectInsurances] = useState<Insurance[]>([]);

  const methods = useForm<PatientValues>({
    resolver: zodResolver(patientSchema),
    mode: 'onBlur',
    defaultValues: {
      personType: 'natural',
      cedula: '',
      email: '',
      firstName: '',
      lastName: '',
      businessName: '',
      rif: '',
      birthDate: '',
      address: '',
      phones: [],
      contractorIds: [],
      directInsuranceIds: [],
      isActive: true,
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await patientGateway.getById(id);
        methods.reset({
          personType: p.personType,
          cedula: p.cedula ?? '',
          email: p.email ?? '',
          firstName: p.firstName ?? '',
          lastName: p.lastName ?? '',
          businessName: p.businessName ?? '',
          rif: p.rif ?? '',
          birthDate: p.birthDate ?? '',
          address: p.address ?? '',
          phones:
            p.phones?.length > 0
              ? p.phones.map((ph) => ({ number: ph.number, label: ph.label ?? '' }))
              : [],
          contractorIds: (p.contractors ?? []).map((c) => c.id),
          directInsuranceIds: (p.insurances ?? []).map((i) => i.id),
          isActive: p.isActive,
        });
        setHeaderLabel(displayName(p));
        setExistingContractors(p.contractors ?? []);
        setExistingDirectInsurances(p.insurances ?? []);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el paciente.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: PatientValues) => {
    if (!id) return;
    try {
      const dto: UpdatePatientDto = {
        personType: values.personType,
        email: values.email?.trim() || '',
        birthDate: values.birthDate || '',
        address: values.address,
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        contractorIds: values.contractorIds ?? [],
        directInsuranceIds: values.directInsuranceIds ?? [],
        isActive: values.isActive,
      };
      if (values.personType === 'natural') {
        dto.cedula = values.cedula?.trim() || '';
        dto.firstName = values.firstName;
        dto.lastName = values.lastName;
      } else {
        dto.businessName = values.businessName;
        dto.rif = values.rif;
      }
      await patientGateway.update(id, dto);
      notify.success('Paciente actualizado');
      navigate('/patients');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el paciente.');
    }
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando paciente…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar paciente
              </h1>
              {headerLabel && <p className="text-sm text-muted-foreground">{headerLabel}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/patients')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a pacientes
            </button>
          </div>

          <PatientForm
            existingContractors={existingContractors}
            existingDirectInsurances={existingDirectInsurances}
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/patients')}>
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
