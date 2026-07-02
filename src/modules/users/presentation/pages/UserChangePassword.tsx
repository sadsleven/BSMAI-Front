import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { FormSection } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { adminChangePasswordSchema } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const invalid = (k: string) =>
    (errors as Record<string, { message?: string } | undefined>)[k]
      ? 'border-destructive focus-visible:ring-destructive/30'
      : '';

  const fieldError = (k: string) =>
    (errors as Record<string, { message?: string } | undefined>)[k]?.message;

  return (
    <div className="max-w-xl mx-auto">
      <PageBreadcrumbs />
      <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" noValidate>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Cambiar contraseña
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a usuarios
          </button>
        </div>

        <FormSection
          title="Contraseña"
          description={
            isSelf
              ? 'Ingresa tu contraseña actual y elige una nueva.'
              : 'Define una nueva contraseña para este usuario.'
          }
        >
          <div className="space-y-4">
            {isSelf ? (
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" className="text-sm font-medium">
                  Contraseña actual <span className="text-destructive">*</span>
                </Label>
                <PasswordInput
                  id="currentPassword"
                  {...register('currentPassword')}
                  className={cn('h-9', invalid('currentPassword'))}
                />
                {fieldError('currentPassword') ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {fieldError('currentPassword')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium">
                Nueva contraseña <span className="text-destructive">*</span>
              </Label>
              <PasswordInput
                id="newPassword"
                {...register('newPassword')}
                className={cn('h-9', invalid('newPassword'))}
              />
              {fieldError('newPassword') ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {fieldError('newPassword')}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmNewPassword" className="text-sm font-medium">
                Confirmar nueva contraseña <span className="text-destructive">*</span>
              </Label>
              <PasswordInput
                id="confirmNewPassword"
                {...register('confirmNewPassword')}
                className={cn('h-9', invalid('confirmNewPassword'))}
              />
              {fieldError('confirmNewPassword') ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {fieldError('confirmNewPassword')}
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo 8 caracteres con mayúscula, minúscula, número y caracter especial.
            </p>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/users')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </form>
    </div>
  );
}
