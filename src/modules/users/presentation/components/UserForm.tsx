import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { Role } from '@/modules/roles/domain/models/role';
import type { RoleSummary } from '../../domain/models/user';
import { roleGateway } from '@/modules/roles/infrastructure/roleGateway';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormSwitch } from '@/components/ui/form-switch';
import { X, Lock } from 'lucide-react';

interface FieldErrorProps {
  message?: string;
}
function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

interface Props {
  mode: 'create' | 'edit';
  canEditSuperAdmin?: boolean;
  existingRoles?: RoleSummary[];
}

export function UserForm({ mode, canEditSuperAdmin, existingRoles }: Props) {
  const {
    register,
    setValue,
    formState: { errors },
    control,
  } = useFormContext();
  const [assignable, setAssignable] = useState<Role[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setAssignable(await roleGateway.listAssignable());
      } catch {
        setAssignable([]);
      }
    })();
  }, []);

  const roleIds: string[] = (useWatch({ control, name: 'roleIds' }) as string[] | undefined) ?? [];
  const isActive = useWatch({ control, name: 'isActive' }) as boolean | undefined;
  const isSuperAdmin = useWatch({ control, name: 'isSuperAdmin' }) as boolean | undefined;

  const setRoles = (next: string[]) =>
    setValue('roleIds', next, { shouldDirty: true, shouldValidate: true });

  const toggleRole = (id: string) => {
    setRoles(roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id]);
  };

  const assignableById = useMemo(() => {
    const map = new Map<string, Role>();
    for (const r of assignable) map.set(r.id, r);
    return map;
  }, [assignable]);

  const existingById = useMemo(() => {
    const map = new Map<string, RoleSummary>();
    for (const r of existingRoles ?? []) map.set(r.id, r);
    return map;
  }, [existingRoles]);

  const staleAssigned = useMemo(
    () =>
      roleIds
        .filter((id) => !assignableById.has(id))
        .map((id) => existingById.get(id))
        .filter((r): r is RoleSummary => !!r),
    [roleIds, assignableById, existingById],
  );

  const e = errors as Record<string, { message?: string } | undefined>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" {...register('firstName')} />
          <FieldError message={e.firstName?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellido</Label>
          <Input id="lastName" {...register('lastName')} />
          <FieldError message={e.lastName?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        <FieldError message={e.email?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phoneNumber">Teléfono (11 dígitos)</Label>
        <Input id="phoneNumber" inputMode="numeric" {...register('phoneNumber')} />
        <FieldError message={e.phoneNumber?.message} />
      </div>

      {mode === 'create' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput id="password" {...register('password')} />
            <FieldError message={e.password?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <PasswordInput id="confirmPassword" {...register('confirmPassword')} />
            <FieldError message={e.confirmPassword?.message} />
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Roles</Label>
        <div className="flex flex-wrap gap-2">
          {assignable.length === 0 && staleAssigned.length === 0 ? (
            <span className="text-sm text-muted-foreground">No hay roles disponibles.</span>
          ) : (
            <>
              {assignable.map((role) => {
                const active = roleIds.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className="cursor-pointer"
                  >
                    <Badge variant={active ? 'default' : 'outline'}>{role.name}</Badge>
                  </button>
                );
              })}
              {staleAssigned.map((role) => {
                const reason = role.deletedAt
                  ? 'Rol en papelera'
                  : role.isActive === false
                    ? 'Rol deshabilitado'
                    : 'Rol no asignable';
                return (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
                    title={`${reason}. Solo se puede quitar.`}
                  >
                    <Lock className="w-3 h-3" />
                    {role.name}
                    <button
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      title="Quitar rol"
                      className="ml-1 rounded hover:bg-accent p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </>
          )}
        </div>
        {staleAssigned.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Algunos roles asignados no están disponibles para nuevos usuarios; podés quitarlos pero
            no volver a agregarlos desde el selector.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <FormSwitch
          label="Habilitado"
          description="Si está deshabilitado, el usuario no podrá iniciar sesión."
          checked={!!isActive}
          onCheckedChange={(v) =>
            setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
          }
        />
        {canEditSuperAdmin ? (
          <FormSwitch
            label="Super Administrador"
            description={
              isSuperAdmin
                ? 'Los Super Administradores tienen acceso completo al sistema, sin restricciones de permisos.'
                : 'Otorga acceso completo al sistema sin restricciones de permisos.'
            }
            checked={!!isSuperAdmin}
            onCheckedChange={(v) =>
              setValue('isSuperAdmin', v, { shouldDirty: true, shouldValidate: true })
            }
          />
        ) : null}
      </div>
    </div>
  );
}
