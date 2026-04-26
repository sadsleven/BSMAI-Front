import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleGateway } from '../../infrastructure/roleGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormSwitch } from '@/components/ui/form-switch';
import { PermissionsPicker } from '../components/PermissionsPicker';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { roleSchema, type RoleValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';

export function RoleEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [isSystem, setIsSystem] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);

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

  if (fetching) return <div>Cargando rol...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Editar rol</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...register('name')} disabled={isSystem} />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : null}
              {isSystem ? (
                <span className="text-xs text-muted-foreground">
                  Los roles del sistema no se pueden modificar.
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" rows={2} {...register('description')} disabled={isSystem} />
              {errors.description ? (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              ) : null}
            </div>
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
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/roles')}>
                Volver
              </Button>
              <Button type="submit" disabled={isSubmitting || isSystem}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permisos del rol</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PermissionsPicker
            value={permissionIds}
            onChange={setPermissionIds}
            disabled={isSystem}
          />
          {isSystem ? (
            <span className="text-xs text-muted-foreground">
              El rol del sistema siempre tiene todos los permisos.
            </span>
          ) : (
            <Can permission={PERMISSIONS.ROLES.ASSIGN_PERMISSIONS}>
              <div className="flex justify-end">
                <Button onClick={handleSavePermissions} disabled={savingPerms}>
                  {savingPerms ? 'Guardando...' : 'Guardar permisos'}
                </Button>
              </div>
            </Can>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
