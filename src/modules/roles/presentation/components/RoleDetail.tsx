import { useEffect, useMemo, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';
import { roleGateway } from '../../infrastructure/roleGateway';
import type { Permission, Role } from '../../domain/models/role';
import { notify } from '@/lib/notifications/toast';

export type RoleDetailProps = {
  roleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoleDetail({ roleId, open, onOpenChange }: RoleDetailProps) {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !roleId) {
      setRole(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    roleGateway
      .getById(roleId)
      .then((r) => {
        if (!cancelled) setRole(r);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el rol.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleId, open]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of role?.permissions ?? []) {
      const key = p.group || p.resource || 'Otros';
      const arr = map.get(key);
      if (arr) arr.push(p);
      else map.set(key, [p]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [role]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Shield}
      title={role ? role.name : 'Detalle del rol'}
      subtitle={role?.description}
      loading={loading}
      maxWidth="data-[size=default]:sm:max-w-[800px]"
    >
      {role ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={role.name} />
            <DetailRow label="Descripción" value={role.description} />
            <DetailRow
              label="Origen"
              value={
                role.isSystem ? (
                  <DetailBadge tone="info">Sistema</DetailBadge>
                ) : (
                  <Badge variant="outline">Personalizado</Badge>
                )
              }
            />
            <DetailRow
              label="Estado"
              value={
                role.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : role.isActive === false ? (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                )
              }
            />
          </DetailSection>

          <DetailSection title={`Permisos (${role.permissions?.length ?? 0})`}>
            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Sin permisos asignados.</p>
            ) : (
              <div className="space-y-3">
                {grouped.map(([group, perms]) => (
                  <div key={group}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                      {group}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((p) => (
                        <Badge
                          key={p.id}
                          variant="outline"
                          title={p.description ?? p.name}
                        >
                          {p.label ?? p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          {(role.createdAt || role.updatedAt) && (
            <DetailSection title="Auditoría">
              {role.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(role.createdAt).toLocaleString()}
                />
              )}
              {role.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(role.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
