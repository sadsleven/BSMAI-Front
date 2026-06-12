import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientGateway } from '../../infrastructure/patientGateway';
import { Button } from '@/components/ui/button';
import { PatientForm } from '../components/PatientForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { patientSchema, type PatientValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft } from 'lucide-react';
import type { CreatePatientDto } from '../../domain/models/patient';

export function PatientCreate() {
  const navigate = useNavigate();

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

  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: PatientValues) => {
    try {
      const dto: CreatePatientDto = {
        personType: values.personType,
        email: values.email?.trim() || undefined,
        birthDate: values.birthDate || undefined,
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
        if (values.cedula?.trim()) dto.cedula = values.cedula.trim();
        dto.firstName = values.firstName;
        dto.lastName = values.lastName;
      } else {
        dto.businessName = values.businessName;
        dto.rif = values.rif;
      }
      await patientGateway.create(dto);
      notify.success('Paciente creado exitosamente');
      navigate('/patients');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el paciente.');
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
                Nuevo paciente
              </h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/patients')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a pacientes
            </button>
          </div>

          <PatientForm />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/patients')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Creando…' : 'Crear paciente'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
