import { useForm } from 'react-hook-form';
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
import { FormSwitch } from '@/components/ui/form-switch';
import { pathologySchema, type PathologyValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { Activity, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pathologyGateway } from '@/modules/pathologies/infrastructure/pathologyGateway';
import type { Pathology } from '@/modules/pathologies/domain/models/pathology';

export type PathologyCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (pathology: Pathology) => void;
};

/**
 * Modal embebido para crear una patología sin salir de la orden. Al guardar,
 * `onCreated(nueva)` la agrega y selecciona en el multi-select de la orden.
 */
export function PathologyCreateModal({
  open,
  onOpenChange,
  onCreated,
}: PathologyCreateModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PathologyValues>({
    resolver: zodResolver(pathologySchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', isActive: true },
  });

  const isActive = watch('isActive') ?? true;
  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const onSubmit = async (values: PathologyValues) => {
    try {
      const created = await pathologyGateway.create({
        name: values.name,
        description: values.description || undefined,
        isActive: values.isActive,
      });
      notify.success('Patología creada');
      reset();
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la patología.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[560px] rounded-xl p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0">
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
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                Nueva patología
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Crea una patología. Quedará agregada y seleccionada en la orden.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.stopPropagation();
            void handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))(e);
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-6 overflow-y-auto flex-1 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pathology-name" className="text-sm font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pathology-name"
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
              <Label htmlFor="pathology-description" className="text-sm font-medium">
                Descripción{' '}
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="pathology-description"
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
            <FormSwitch
              label="Habilitada"
              description="Si está deshabilitada, no aparecerá como opción asignable."
              checked={isActive}
              onCheckedChange={(v) =>
                setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
              }
            />
          </div>
          <AlertDialogFooter className="px-6 py-4 border-t gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear patología'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
