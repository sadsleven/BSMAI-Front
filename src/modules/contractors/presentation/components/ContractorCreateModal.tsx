import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InsuranceMultiSelect } from '@/components/ui/insurance-multi-select';
import { contractorSchema, type ContractorValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { Briefcase, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contractorGateway } from '@/modules/contractors/infrastructure/contractorGateway';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

export type ContractorCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (contractor: Contractor) => void;
};

/**
 * Modal embebido para crear un contratista sin salir del formulario actual.
 * Mismo patrón que `PatientCreateModal`/`SpecialtyCreateModal`: al guardar,
 * `onCreated(nuevo)` lo autoselecciona en el selector que lo invocó.
 */
export function ContractorCreateModal({
  open,
  onOpenChange,
  onCreated,
}: ContractorCreateModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContractorValues>({
    resolver: zodResolver(contractorSchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', insuranceIds: [], isActive: true },
  });

  // Cada apertura arranca limpia (la instancia persiste montada en el padre).
  useEffect(() => {
    if (open) reset({ name: '', description: '', insuranceIds: [], isActive: true });
  }, [open, reset]);

  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const onSubmit = async (values: ContractorValues) => {
    try {
      const created = await contractorGateway.create({
        name: values.name,
        description: values.description || undefined,
        isActive: values.isActive,
        insuranceIds: values.insuranceIds ?? [],
      });
      notify.success('Contratista creado');
      reset();
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el contratista.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[640px] rounded-xl p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0">
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
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                Nuevo contratista
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Crea un contratista. Quedará autoseleccionado.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            // Modal embebido dentro de otro <form> (paciente/orden). Frena la
            // propagación para no disparar el submit del formulario contenedor.
            e.stopPropagation();
            void handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))(e);
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-6 overflow-y-auto flex-1 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contractor-name" className="text-sm font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contractor-name"
                {...register('name')}
                className={cn('h-9', invalid('name'))}
              />
              {errors.name ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractor-description" className="text-sm font-medium">
                Descripción{' '}
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="contractor-description"
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
            <Controller
              name="insuranceIds"
              control={control}
              render={({ field }) => (
                <InsuranceMultiSelect
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={
                    typeof errors.insuranceIds?.message === 'string'
                      ? errors.insuranceIds.message
                      : undefined
                  }
                />
              )}
            />
          </div>
          <AlertDialogFooter className="px-6 py-4 border-t gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear contratista'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
