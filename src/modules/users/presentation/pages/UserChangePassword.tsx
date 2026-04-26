import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { adminChangePasswordSchema } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';

export function UserChangePassword() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const isSelf = !!id && me?.id === id;

  const schema = useMemo(() => adminChangePasswordSchema(isSelf), [isSelf]);
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const onSubmit = async (values: Values) => {
    if (!id) return;
    try {
      await userGateway.changePassword(id, {
        currentPassword: isSelf ? values.currentPassword : undefined,
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      });
      notify.success('Contraseña actualizada correctamente');
      reset({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar la contraseña.');
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {isSelf ? (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Contraseña actual</Label>
                <PasswordInput id="currentPassword" {...register('currentPassword')} />
                {errors.currentPassword ? (
                  <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <PasswordInput id="newPassword" {...register('newPassword')} />
              {errors.newPassword ? (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Confirmar nueva contraseña</Label>
              <PasswordInput id="confirmNewPassword" {...register('confirmNewPassword')} />
              {errors.confirmNewPassword ? (
                <p className="text-xs text-destructive">{errors.confirmNewPassword.message}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                Volver
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Cambiar contraseña'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
