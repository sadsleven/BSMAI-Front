import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientGateway } from '../../infrastructure/patientGateway';
import { fullName } from '../../domain/models/patient';
import { Button } from '@/components/ui/button';
import { PatientForm } from '../components/PatientForm';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { patientSchema, type PatientValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { ChevronLeft } from 'lucide-react';

export function PatientEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');

  const methods = useForm<PatientValues>({
    resolver: zodResolver(patientSchema),
    mode: 'onBlur',
    defaultValues: {
      cedula: '',
      email: '',
      firstName: '',
      lastName: '',
      birthDate: '',
      address: '',
      phones: [{ number: '', label: '' }],
      isActive: true,
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await patientGateway.getById(id);
        methods.reset({
          cedula: p.cedula,
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthDate,
          address: p.address,
          phones:
            p.phones?.length > 0
              ? p.phones.map((ph) => ({ number: ph.number, label: ph.label ?? '' }))
              : [{ number: '', label: '' }],
          isActive: p.isActive,
        });
        setDisplayName(fullName(p));
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
      await patientGateway.update(id, {
        cedula: values.cedula,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: values.birthDate,
        address: values.address,
        phones: values.phones.map((p) => ({
          number: p.number,
          label: p.label || undefined,
        })),
        isActive: values.isActive,
      });
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
        <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar paciente
              </h1>
              {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
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
