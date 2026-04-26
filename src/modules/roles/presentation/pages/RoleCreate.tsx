import { useNavigate } from 'react-router-dom';
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
import { roleSchema, type RoleValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';

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
      <Card>
        <CardHeader>
          <CardTitle>Crear rol</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...register('name')} />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" rows={2} {...register('description')} />
              {errors.description ? (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              ) : null}
            </div>
            <FormSwitch
              label="Habilitado"
              description="Si está deshabilitado, los usuarios con este rol no recibirán los permisos asociados."
              checked={isActive}
              onCheckedChange={(v) =>
                setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
              }
            />
            <div className="space-y-2">
              <Label>Permisos</Label>
              <PermissionsPicker
                value={permissionIds}
                onChange={(ids) =>
                  setValue('permissionIds', ids, { shouldDirty: true, shouldValidate: true })
                }
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/roles')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creando...' : 'Crear'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
