import { useEffect, useMemo, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { Role } from '@/modules/roles/domain/models/role';
import type { BranchSummary, RoleSummary } from '../../domain/models/user';
import type { Branch } from '@/modules/branches/domain/models/branch';
import { roleGateway } from '@/modules/roles/infrastructure/roleGateway';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { BranchMultiSelect } from '@/components/ui/branch-multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ACADEMIC_DEGREES } from '@/lib/validations/schemas';
import { X, Lock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldErrorProps {
  message?: string;
}
function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  );
}

function RequiredLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
      {required ? <span className="text-destructive ml-0.5">*</span> : null}
    </Label>
  );
}

interface Props {
  mode: 'create' | 'edit';
  canEditSuperAdmin?: boolean;
  existingRoles?: RoleSummary[];
  existingBranches?: BranchSummary[];
}

export function UserForm({ mode, canEditSuperAdmin, existingRoles, existingBranches }: Props) {
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

  const roleIds: string[] =
    (useWatch({ control, name: 'roleIds' }) as string[] | undefined) ?? [];
  const branchIds: string[] =
    (useWatch({ control, name: 'branchIds' }) as string[] | undefined) ?? [];
  const isActive = useWatch({ control, name: 'isActive' }) as boolean | undefined;
  const isSuperAdmin = useWatch({ control, name: 'isSuperAdmin' }) as boolean | undefined;

  const setBranches = (next: string[]) =>
    setValue('branchIds', next, { shouldDirty: true, shouldValidate: true });

  const existingBranchesAsBranch: Branch[] = useMemo(
    () =>
      (existingBranches ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        isActive: b.isActive ?? true,
        deletedAt: b.deletedAt ?? null,
      })),
    [existingBranches],
  );

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
  const inputInvalid = (key: string) =>
    e[key]?.message ? 'border-destructive focus-visible:ring-destructive/30' : '';

  return (
    <div className="space-y-4">
      <FormSection
        title="Información personal"
        description="Datos básicos del usuario y forma de contacto."
      >
        <FormGrid>
          <div className="space-y-1.5">
            <RequiredLabel htmlFor="firstName" required>
              Nombre
            </RequiredLabel>
            <Input
              id="firstName"
              {...register('firstName')}
              className={cn('h-9', inputInvalid('firstName'))}
            />
            <FieldError message={e.firstName?.message} />
          </div>
          <div className="space-y-1.5">
            <RequiredLabel htmlFor="lastName" required>
              Apellido
            </RequiredLabel>
            <Input
              id="lastName"
              {...register('lastName')}
              className={cn('h-9', inputInvalid('lastName'))}
            />
            <FieldError message={e.lastName?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <RequiredLabel htmlFor="email" required>
              Email
            </RequiredLabel>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className={cn('h-9', inputInvalid('email'))}
            />
            <FieldError message={e.email?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <RequiredLabel htmlFor="phoneNumber">Teléfono</RequiredLabel>
            <Input
              id="phoneNumber"
              inputMode="numeric"
              placeholder="11 dígitos"
              {...register('phoneNumber')}
              className={cn('h-9', inputInvalid('phoneNumber'))}
            />
            <p className="text-xs text-muted-foreground">Opcional. Exactamente 11 dígitos.</p>
            <FieldError message={e.phoneNumber?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="academicDegree" className="text-sm font-medium">
              Grado académico{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Controller
              control={control}
              name="academicDegree"
              render={({ field }) => (
                <Select
                  value={(field.value as string) || ''}
                  onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger
                    id="academicDegree"
                    className={cn('h-9', inputInvalid('academicDegree'))}
                  >
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
            <FieldError message={e.academicDegree?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle" className="text-sm font-medium">
              Cargo{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="jobTitle"
              maxLength={100}
              placeholder="Ej: Gerente de Administración"
              {...register('jobTitle')}
              className={cn('h-9', inputInvalid('jobTitle'))}
            />
            <FieldError message={e.jobTitle?.message} />
          </div>
        </FormGrid>
      </FormSection>

      {mode === 'create' ? (
        <FormSection
          title="Acceso"
          description="Definí la contraseña inicial. El usuario podrá cambiarla luego desde su perfil."
        >
          <FormGrid>
            <div className="space-y-1.5">
              <RequiredLabel htmlFor="password" required>
                Contraseña
              </RequiredLabel>
              <PasswordInput
                id="password"
                {...register('password')}
                className={cn('h-9', inputInvalid('password'))}
              />
              <FieldError message={e.password?.message} />
            </div>
            <div className="space-y-1.5">
              <RequiredLabel htmlFor="confirmPassword" required>
                Confirmar contraseña
              </RequiredLabel>
              <PasswordInput
                id="confirmPassword"
                {...register('confirmPassword')}
                className={cn('h-9', inputInvalid('confirmPassword'))}
              />
              <FieldError message={e.confirmPassword?.message} />
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Mínimo 8 caracteres con mayúscula, minúscula, número y caracter especial.
            </p>
          </FormGrid>
        </FormSection>
      ) : null}

      <FormSection
        title="Roles y permisos"
        description="Asigná uno o más roles. Los permisos efectivos resultan de la unión."
      >
        <div className="space-y-3">
          <Label className="text-sm font-medium">Roles</Label>
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
              Algunos roles asignados no están disponibles para nuevos usuarios; podés quitarlos
              pero no volver a agregarlos desde el selector.
            </p>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="Sucursales"
        description="Sucursales en las que el usuario puede operar."
        allowOverflow
      >
        {isSuperAdmin ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-brand-blue shrink-0" />
            <span>
              Los Super Administradores tienen acceso a todas las sucursales automáticamente.
            </span>
          </div>
        ) : (
          <BranchMultiSelect
            value={branchIds}
            onChange={setBranches}
            existing={existingBranchesAsBranch}
            error={e.branchIds?.message}
          />
        )}
      </FormSection>

      <FormSection
        title="Estado de la cuenta"
        description="Controla el acceso del usuario al sistema."
      >
        <div className="space-y-4">
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
      </FormSection>
    </div>
  );
}
