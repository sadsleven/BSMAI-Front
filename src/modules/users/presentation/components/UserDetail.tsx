import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { userGateway } from '../../infrastructure/userGateway';
import { fullName, type User } from '../../domain/models/user';
import { notify } from '@/lib/notifications/toast';

export type UserDetailProps = {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserDetail({ userId, open, onOpenChange }: UserDetailProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) {
      setUser(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    userGateway
      .getById(userId)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el usuario.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Users}
      title={user ? fullName(user) : 'Detalle del usuario'}
      subtitle={user?.email}
      loading={loading}
    >
      {user ? (
        <div className="divide-y">
          <DetailSection title="Datos personales">
            <DetailRow label="Nombre" value={user.firstName} />
            <DetailRow label="Apellido" value={user.lastName} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Teléfono" value={user.phoneNumber} mono />
            <DetailRow label="Grado académico" value={user.academicDegree} />
            <DetailRow label="Cargo" value={user.jobTitle} />
            <DetailRow
              label="Estado"
              value={
                user.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : user.isActive ? (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                )
              }
            />
            {user.isSuperAdmin && (
              <DetailRow
                label="Privilegios"
                value={<DetailBadge tone="info">Super Admin</DetailBadge>}
              />
            )}
          </DetailSection>

          <DetailSection title={`Roles (${user.roles?.length ?? 0})`}>
            {user.roles?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {user.roles.map((r) => {
                  const stale = r.deletedAt || r.isActive === false;
                  return (
                    <Badge
                      key={r.id}
                      variant="outline"
                      className={stale ? 'border-dashed text-muted-foreground' : ''}
                      title={
                        r.deletedAt
                          ? 'Rol en papelera'
                          : r.isActive === false
                            ? 'Rol deshabilitado'
                            : undefined
                      }
                    >
                      {r.name}
                      {r.isSystem ? ' · Sistema' : ''}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin roles asignados.</p>
            )}
          </DetailSection>

          <DetailSection
            title={
              user.isSuperAdmin
                ? 'Sucursales (todas)'
                : `Sucursales (${user.branches?.length ?? 0})`
            }
          >
            {user.isSuperAdmin ? (
              <p className="text-sm text-muted-foreground">
                Los Super Administradores tienen acceso a todas las sucursales automáticamente.
              </p>
            ) : user.branches?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {user.branches.map((b) => {
                  const stale = b.deletedAt || b.isActive === false;
                  return (
                    <Badge
                      key={b.id}
                      variant="outline"
                      className={stale ? 'border-dashed text-muted-foreground' : ''}
                      title={
                        b.deletedAt
                          ? 'Sucursal en papelera'
                          : b.isActive === false
                            ? 'Sucursal deshabilitada'
                            : undefined
                      }
                    >
                      {b.name}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin sucursales asignadas.</p>
            )}
          </DetailSection>

          {(user.createdAt || user.updatedAt) && (
            <DetailSection title="Auditoría">
              {user.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(user.createdAt).toLocaleString()}
                />
              )}
              {user.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(user.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
