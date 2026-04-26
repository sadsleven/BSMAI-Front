import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserForm } from '../components/UserForm';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { updateUserSchema, type UpdateUserValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import type { RoleSummary } from '../../domain/models/user';

export function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin } = usePermissions();
  const [fetching, setFetching] = useState(true);
  const [existingRoles, setExistingRoles] = useState<RoleSummary[]>([]);

  const methods = useForm<UpdateUserValues>({
    resolver: zodResolver(updateUserSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      isActive: true,
      isSuperAdmin: false,
      roleIds: [],
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const user = await userGateway.getById(id);
        methods.reset({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber ?? '',
          isActive: user.isActive,
          isSuperAdmin: user.isSuperAdmin,
          roleIds: user.roles?.map((r) => r.id) ?? [],
        });
        setExistingRoles(user.roles ?? []);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el usuario.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: UpdateUserValues) => {
    if (!id) return;
    try {
      await userGateway.update(id, {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: values.phoneNumber || null,
        isActive: values.isActive,
        isSuperAdmin: isSuperAdmin ? values.isSuperAdmin : undefined,
        roleIds: values.roleIds,
      });
      notify.success('Usuario actualizado');
      navigate('/users');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el usuario.');
    }
  };

  if (fetching) return <div>Cargando usuario...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Editar usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-4">
              <UserForm
                mode="edit"
                canEditSuperAdmin={isSuperAdmin}
                existingRoles={existingRoles}
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={methods.formState.isSubmitting}>
                  {methods.formState.isSubmitting ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </form>
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}
