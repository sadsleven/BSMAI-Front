import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserForm } from '../components/UserForm';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { createUserSchema, type CreateUserValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';

export function UserCreate() {
  const navigate = useNavigate();
  const { isSuperAdmin } = usePermissions();

  const methods = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      isActive: true,
      isSuperAdmin: false,
      roleIds: [],
    },
  });

  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: CreateUserValues) => {
    try {
      await userGateway.create({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: values.phoneNumber || undefined,
        password: values.password,
        confirmPassword: values.confirmPassword,
        isActive: values.isActive,
        isSuperAdmin: isSuperAdmin ? values.isSuperAdmin : undefined,
        roleIds: values.roleIds,
      });
      notify.success('Usuario creado exitosamente');
      navigate('/users');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el usuario.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Crear usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <UserForm mode="create" canEditSuperAdmin={isSuperAdmin} />
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={formState.isSubmitting}>
                  {formState.isSubmitting ? 'Creando...' : 'Crear'}
                </Button>
              </div>
            </form>
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}
