import { useEffect, useState } from 'react';
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
import { UserRound, X, Loader2 } from 'lucide-react';
import type { UpdatePatientDto, Patient } from '@/modules/patients/domain/models/patient';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';

export type PatientEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id del paciente a editar. Se hidrata al abrir. */
  patientId: string | null;
  /** Ejecutado tras guardar; el caller refresca su selección/seguros. */
  onSaved: (patient: Patient) => void;
};

/**
 * Modal embebido para EDITAR un paciente ya seleccionado en la orden — mismo
 * patrón que <PatientCreateModal> pero hidrata el form vía `getById` y guarda
 * con `update`. Al guardar, ejecuta `onSaved(updated)` para que la orden
 * refresque el titular/paciente y sus seguros disponibles.
 */
export function PatientEditModal({
  open,
  onOpenChange,
  patientId,
  onSaved,
}: PatientEditModalProps) {
  const [fetching, setFetching] = useState(false);
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

  const { handleSubmit, formState, reset } = methods;

  // Hidrata el form cada vez que se abre con un paciente.
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;
    setFetching(true);
    (async () => {
      try {
        const p = await patientGateway.getById(patientId);
        if (cancelled) return;
        reset({
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
        setHeaderLabel(
          p.personType === 'legal_entity'
            ? p.businessName ?? ''
            : `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        );
        setExistingContractors(p.contractors ?? []);
        setExistingDirectInsurances(p.insurances ?? []);
      } catch (e) {
        if (!cancelled) {
          notify.fromError(e, 'No se pudo cargar el paciente.');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  const onSubmit = async (values: PatientValues) => {
    if (!patientId) return;
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
      const updated = await patientGateway.update(patientId, dto);
      notify.success('Paciente actualizado');
      onSaved(updated);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el paciente.');
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
                Editar paciente
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {headerLabel
                  ? `Actualiza los datos de ${headerLabel}. Los cambios se reflejan en la orden.`
                  : 'Actualiza los datos del paciente. Los cambios se reflejan en la orden.'}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        {fetching ? (
          <div className="px-6 py-16 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando paciente…
          </div>
        ) : (
          <FormProvider {...methods}>
            <form
              onSubmit={(e) => {
                // Modal embebido dentro del <form> de la orden (portal Radix; los
                // eventos igual burbujean por el árbol de componentes). Frena la
                // propagación para no disparar el submit/guardado de la orden.
                e.stopPropagation();
                void handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))(e);
              }}
              className="flex flex-col flex-1 overflow-hidden"
              autoComplete="off"
            >
              <div className="px-6 overflow-y-auto flex-1 py-4">
                <PatientForm
                  existingContractors={existingContractors}
                  existingDirectInsurances={existingDirectInsurances}
                />
              </div>
              <AlertDialogFooter className="px-6 py-4 border-t gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={formState.isSubmitting}>
                  {formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </AlertDialogFooter>
            </form>
          </FormProvider>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
