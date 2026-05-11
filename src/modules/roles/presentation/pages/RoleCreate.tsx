import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleGateway } from '../../infrastructure/roleGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PermissionsPicker } from '../components/PermissionsPicker';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { roleSchema, type RoleValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RoleCreate() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', isActive: true, permissionIds: [] },
  });

  const permissionIds = watch('permissionIds') ?? [];
  const isActive = watch('isActive') ?? true;

  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const onSubmit = async (values: RoleValues) => {
    try {
      await roleGateway.create({
        name: values.name,
        description: values.description,
        isActive: values.isActive,
        permissionIds: values.permissionIds,
      });
      notify.success('Rol creado exitosamente');
      navigate('/roles');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el rol.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" noValidate>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Nuevo rol
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/roles')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a roles
          </button>
        </div>

        <FormSection
          title="Información del rol"
          description="Nombre visible y descripción opcional."
        >
          <FormGrid>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" {...register('name')} className={cn('h-9', invalid('name'))} />
              {errors.name ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Descripción
              </Label>
              <Textarea
                id="description"
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
          </FormGrid>
        </FormSection>

        <FormSection
          title="Estado"
          description="Roles deshabilitados no conceden permisos a sus usuarios."
        >
          <FormSwitch
            label="Habilitado"
            description="Si está deshabilitado, los usuarios con este rol no recibirán los permisos asociados."
            checked={isActive}
            onCheckedChange={(v) =>
              setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
            }
          />
        </FormSection>

        <FormSection
          title="Permisos"
          description="Seleccioná los permisos que otorga este rol."
        >
          <PermissionsPicker
            value={permissionIds}
            onChange={(ids) =>
              setValue('permissionIds', ids, { shouldDirty: true, shouldValidate: true })
            }
          />
        </FormSection>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Campos obligatorios
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/roles')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear rol'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
