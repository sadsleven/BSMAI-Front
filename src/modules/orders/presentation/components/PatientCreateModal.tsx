import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { PatientForm } from '@/modules/patients/presentation/components/PatientForm';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { patientSchema, type PatientValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { UserRound, X } from 'lucide-react';
import type { CreatePatientDto, Patient } from '@/modules/patients/domain/models/patient';

export type PatientCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (patient: Patient) => void;
};

/**
 * Modal embebido del formulario de pacientes — patrón "selector con búsqueda
 * + botón crear que abre el form del módulo dueño". Al guardar, ejecuta
 * `onCreated(newPatient)` para que el caller autoseleccione el resultado.
 */
export function PatientCreateModal({ open, onOpenChange, onCreated }: PatientCreateModalProps) {
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

  const { handleSubmit, formState, reset } = methods;

  const onSubmit = async (values: PatientValues) => {
    try {
      const dto: CreatePatientDto = {
        personType: values.personType,
        email: values.email,
        birthDate: values.birthDate || undefined,
        address: values.address || undefined,
        phones: values.phones.map((p) => ({ number: p.number, label: p.label || undefined })),
        contractorIds: values.contractorIds ?? [],
        directInsuranceIds: values.directInsuranceIds ?? [],
        isActive: values.isActive,
      };
      if (values.personType === 'natural') {
        dto.cedula = values.cedula;
        dto.firstName = values.firstName;
        dto.lastName = values.lastName;
      } else {
        dto.businessName = values.businessName;
        dto.rif = values.rif;
      }
      const created = await patientGateway.create(dto);
      notify.success('Paciente creado');
      reset();
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el paciente.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[860px] rounded-xl p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <AlertDialogHeader className="px-6 pt-5 pr-12 gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                Nuevo paciente
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Completa los datos para crear un paciente. Quedará autoseleccionado en la orden.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <FormProvider {...methods}>
          <form
            onSubmit={(e) => {
              // Modal embebido dentro del <form> de la orden (portal Radix; los
              // eventos de React igual burbujean por el árbol de componentes).
              // Frena la propagación para no disparar el submit/guardado de la orden.
              e.stopPropagation();
              void handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))(e);
            }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="px-6 overflow-y-auto flex-1 py-4">
              <PatientForm />
            </div>
            <AlertDialogFooter className="px-6 py-4 border-t gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Creando…' : 'Crear paciente'}
              </Button>
            </AlertDialogFooter>
          </form>
        </FormProvider>
      </AlertDialogContent>
    </AlertDialog>
  );
}
