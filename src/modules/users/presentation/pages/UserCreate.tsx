import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { UserForm } from '../components/UserForm';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { createUserSchema, type CreateUserValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ChevronLeft } from 'lucide-react';

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
      academicDegree: '',
      jobTitle: '',
      password: '',
      confirmPassword: '',
      isActive: true,
      isSuperAdmin: false,
      roleIds: [],
      branchIds: [],
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
        academicDegree: values.academicDegree?.trim() || undefined,
        jobTitle: values.jobTitle?.trim() || undefined,
        password: values.password,
        confirmPassword: values.confirmPassword,
        isActive: values.isActive,
        isSuperAdmin: isSuperAdmin ? values.isSuperAdmin : undefined,
        roleIds: values.roleIds,
        branchIds: values.isSuperAdmin ? undefined : values.branchIds,
      });
      notify.success('Usuario creado exitosamente');
      navigate('/users');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el usuario.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Nuevo usuario
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

          <UserForm mode="create" canEditSuperAdmin={isSuperAdmin} />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Creando…' : 'Crear usuario'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
