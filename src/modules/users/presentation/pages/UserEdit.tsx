import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userGateway } from '../../infrastructure/userGateway';
import { Button } from '@/components/ui/button';
import { UserForm } from '../components/UserForm';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { updateUserSchema, type UpdateUserValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import type { BranchSummary, RoleSummary } from '../../domain/models/user';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
import { ChevronLeft } from 'lucide-react';

export function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin } = usePermissions();
  const [fetching, setFetching] = useState(true);
  const [existingRoles, setExistingRoles] = useState<RoleSummary[]>([]);
  const [existingBranches, setExistingBranches] = useState<BranchSummary[]>([]);
  const [displayName, setDisplayName] = useState('');

  const methods = useForm<UpdateUserValues>({
    resolver: zodResolver(updateUserSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      academicDegree: '',
      jobTitle: '',
      isActive: true,
      isSuperAdmin: false,
      roleIds: [],
      branchIds: [],
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
          academicDegree: user.academicDegree ?? '',
          jobTitle: user.jobTitle ?? '',
          isActive: user.isActive,
          isSuperAdmin: user.isSuperAdmin,
          roleIds: user.roles?.map((r) => r.id) ?? [],
          branchIds: user.branches?.map((b) => b.id) ?? [],
        });
        setExistingRoles(user.roles ?? []);
        setExistingBranches(user.branches ?? []);
        setDisplayName(`${user.firstName} ${user.lastName}`.trim());
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
        phoneNumber: values.phoneNumber || null,
        academicDegree: values.academicDegree?.trim() || null,
        jobTitle: values.jobTitle?.trim() || null,
        isActive: values.isActive,
        isSuperAdmin: isSuperAdmin ? values.isSuperAdmin : undefined,
        roleIds: values.roleIds,
        branchIds: values.isSuperAdmin ? undefined : values.branchIds,
      });
      notify.success('Usuario actualizado');
      navigate('/users');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar el usuario.');
    }
  };

  if (fetching) {
    return <PageLoader label="Cargando usuario…" />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6" autoComplete="off">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar usuario
              </h1>
              {displayName && (
                <p className="text-sm text-muted-foreground">{displayName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/users')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a usuarios
            </button>
          </div>

          <UserForm
            mode="edit"
            canEditSuperAdmin={isSuperAdmin}
            existingRoles={existingRoles}
            existingBranches={existingBranches}
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={methods.formState.isSubmitting}>
                {methods.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
