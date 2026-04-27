import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleGateway } from '../../infrastructure/roleGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PermissionsPicker } from '../components/PermissionsPicker';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { roleSchema, type RoleValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { ChevronLeft, AlertTriangle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RoleEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [isSystem, setIsSystem] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', isActive: true, permissionIds: [] },
  });

  const isActive = watch('isActive') ?? true;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const role = await roleGateway.getById(id);
        reset({
          name: role.name,
          description: role.description ?? '',
          isActive: role.isActive ?? true,
          permissionIds: role.permissions.map((p) => p.id),
        });
        setPermissionIds(role.permissions.map((p) => p.id));
        setIsSystem(role.isSystem ?? false);
        setDisplayName(role.name);
      } catch (err) {
        notify.fromError(err, 'No se pudo cargar el rol.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: RoleValues) => {
    if (!id || isSystem) return;
    try {
      await roleGateway.update(id, {
        name: values.name,
        description: values.description,
        isActive: values.isActive,
      });
      notify.success('Rol actualizado');
      navigate('/roles');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el rol.');
    }
  };

  const handleSavePermissions = async () => {
    if (!id || isSystem) return;
    setSavingPerms(true);
    try {
      await roleGateway.assignPermissions(id, { permissionIds });
      notify.success('Permisos actualizados');
    } catch (err) {
      notify.fromError(err, 'No se pudieron actualizar los permisos.');
    } finally {
      setSavingPerms(false);
    }
  };

  if (fetching) return <div className="text-sm text-muted-foreground">Cargando rol…</div>;

  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Editar rol
            </h1>
            {isSystem ? (
              <Badge variant="default" className="gap-1">
                <Shield className="w-3 h-3" /> Sistema
              </Badge>
            ) : null}
          </div>
          {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
        </div>
        <button
          type="button"
          onClick={() => navigate('/roles')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver a roles
        </button>
      </div>

      <form id="role-edit-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormSection title="Información del rol">
          <FormGrid>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...register('name')}
                disabled={isSystem}
                className={cn('h-9', invalid('name'))}
              />
              {errors.name ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.name.message}
                </p>
              ) : null}
              {isSystem ? (
                <p className="text-xs text-muted-foreground">
                  Los roles del sistema no se pueden modificar.
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
                disabled={isSystem}
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

        <FormSection title="Estado">
          <FormSwitch
            label="Habilitado"
            description={
              isSystem
                ? 'Los roles del sistema están siempre habilitados.'
                : 'Si está deshabilitado, los usuarios con este rol no recibirán los permisos asociados.'
            }
            checked={isSystem ? true : isActive}
            onCheckedChange={(v) =>
              setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
            }
            disabled={isSystem}
            tooltip={isSystem ? 'Los roles del sistema no se pueden deshabilitar.' : undefined}
          />
        </FormSection>
      </form>

      <FormSection
        title="Permisos del rol"
        description="Seleccioná los permisos que otorga este rol."
        footer={
          isSystem ? (
            <span className="text-xs text-muted-foreground">
              El rol del sistema siempre tiene todos los permisos.
            </span>
          ) : (
            <Can permission={PERMISSIONS.ROLES.ASSIGN_PERMISSIONS}>
              <span className="text-xs text-muted-foreground">
                {permissionIds.length} permiso(s) seleccionados
              </span>
              <Button onClick={handleSavePermissions} disabled={savingPerms}>
                {savingPerms ? 'Guardando…' : 'Guardar permisos'}
              </Button>
            </Can>
          )
        }
      >
        <PermissionsPicker
          value={permissionIds}
          onChange={setPermissionIds}
          disabled={isSystem}
        />
      </FormSection>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => navigate('/roles')}>
          Cancelar
        </Button>
        <Button
          type="submit"
          form="role-edit-form"
          disabled={isSubmitting || isSystem}
        >
          {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
