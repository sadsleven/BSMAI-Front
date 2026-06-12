import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  profileSchema,
  type ProfileValues,
  changeOwnPasswordSchema,
  type ChangeOwnPasswordValues,
  ACADEMIC_DEGREES,
} from '@/lib/validations/schemas';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Controller } from 'react-hook-form';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  // Teléfono, grado académico y cargo son campos internos AFMI — los
  // proveedores (doctor/centro) no los ven ni los modifican.
  const isProvider = !!user?.providerLink;

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phoneNumber: user?.phoneNumber ?? '',
      academicDegree: user?.academicDegree ?? '',
      jobTitle: user?.jobTitle ?? '',
    },
  });

  useEffect(() => {
    profileForm.reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phoneNumber: user?.phoneNumber ?? '',
      academicDegree: user?.academicDegree ?? '',
      jobTitle: user?.jobTitle ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onProfileSubmit = async (values: ProfileValues) => {
    try {
      const updated = await authApi.updateMyProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        ...(isProvider
          ? {}
          : {
              phoneNumber: values.phoneNumber ?? null,
              academicDegree: values.academicDegree?.trim() || null,
              jobTitle: values.jobTitle?.trim() || null,
            }),
      });
      setUser(updated);
      notify.success('Perfil actualizado correctamente');
      profileForm.reset({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phoneNumber: updated.phoneNumber ?? '',
        academicDegree: updated.academicDegree ?? '',
        jobTitle: updated.jobTitle ?? '',
      });
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el perfil.');
    }
  };

  const passwordForm = useForm<ChangeOwnPasswordValues>({
    resolver: zodResolver(changeOwnPasswordSchema),
    mode: 'onBlur',
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const onPasswordSubmit = async (values: ChangeOwnPasswordValues) => {
    try {
      await authApi.changeMyPassword(values);
      notify.success('Contraseña actualizada correctamente');
      passwordForm.reset({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    } catch (err) {
      notify.fromError(err, 'No se pudo cambiar la contraseña.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <h1 className="text-2xl font-bold">Mi perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit, (errs) => notifyFormErrors(errs))} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" {...profileForm.register('firstName')} />
                {profileForm.formState.errors.firstName ? (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.firstName.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input id="lastName" {...profileForm.register('lastName')} />
                {profileForm.formState.errors.lastName ? (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.lastName.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...profileForm.register('email')} />
              {profileForm.formState.errors.email ? (
                <p className="text-xs text-destructive">
                  {profileForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>
            {!isProvider && (
            <>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Teléfono (11 dígitos)</Label>
              <Input id="phoneNumber" inputMode="numeric" {...profileForm.register('phoneNumber')} />
              {profileForm.formState.errors.phoneNumber ? (
                <p className="text-xs text-destructive">
                  {profileForm.formState.errors.phoneNumber.message}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="academicDegree">Grado académico (opcional)</Label>
                <Controller
                  control={profileForm.control}
                  name="academicDegree"
                  render={({ field }) => (
                    <Select
                      value={(field.value as string) || ''}
                      onValueChange={(v) =>
                        field.onChange(v === '__none__' ? '' : v)
                      }
                    >
                      <SelectTrigger id="academicDegree">
                        <SelectValue placeholder="Seleccioná un título" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground italic">Ninguno</span>
                        </SelectItem>
                        {ACADEMIC_DEGREES.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {profileForm.formState.errors.academicDegree ? (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.academicDegree.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Cargo (opcional)</Label>
                <Input
                  id="jobTitle"
                  maxLength={100}
                  placeholder="Ej: Gerente de Administración"
                  {...profileForm.register('jobTitle')}
                />
                {profileForm.formState.errors.jobTitle ? (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.jobTitle.message}
                  </p>
                ) : null}
              </div>
            </div>
            </>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!profileForm.formState.isDirty || profileForm.formState.isSubmitting}
              >
                {profileForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit(onPasswordSubmit, (errs) => notifyFormErrors(errs))}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <PasswordInput
                id="currentPassword"
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword ? (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <PasswordInput id="newPassword" {...passwordForm.register('newPassword')} />
              {passwordForm.formState.errors.newPassword ? (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Confirmar nueva contraseña</Label>
              <PasswordInput
                id="confirmNewPassword"
                {...passwordForm.register('confirmNewPassword')}
              />
              {passwordForm.formState.errors.confirmNewPassword ? (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.confirmNewPassword.message}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                {passwordForm.formState.isSubmitting ? 'Guardando...' : 'Cambiar contraseña'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
