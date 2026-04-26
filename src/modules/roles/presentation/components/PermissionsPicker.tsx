import { useEffect, useMemo, useState } from 'react';
import { permissionGateway } from '../../infrastructure/roleGateway';
import type { Permission } from '../../domain/models/role';
import { Badge } from '@/components/ui/badge';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const ACTION_ORDER = [
  'list',
  'view',
  'create',
  'update',
  'change-password',
  'toggle-active',
  'assign-permissions',
  'soft-delete',
  'hard-delete',
  'restore',
];

function actionRank(action: string): number {
  const i = ACTION_ORDER.indexOf(action);
  return i === -1 ? 999 : i;
}

function groupLabel(p: Permission): string {
  return p.group ?? p.resource;
}

function permLabel(p: Permission): string {
  return p.label ?? p.description ?? p.name;
}

export function PermissionsPicker({ value, onChange, disabled }: Props) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPermissions(await permissionGateway.list());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const key = groupLabel(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    for (const [, perms] of map) {
      perms.sort((a, b) => actionRank(a.action) - actionRank(b.action));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [permissions]);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const toggleGroup = (groupName: string) => {
    if (disabled) return;
    const ids = (grouped.find(([g]) => g === groupName)?.[1] ?? []).map((p) => p.id);
    const allSelected = ids.every((id) => value.includes(id));
    if (allSelected) onChange(value.filter((id) => !ids.includes(id)));
    else onChange(Array.from(new Set([...value, ...ids])));
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando permisos...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Seleccionados: <Badge variant="secondary">{value.length}</Badge> / {permissions.length}
      </div>
      <div className="space-y-3">
        {grouped.map(([groupName, perms]) => {
          const ids = perms.map((p) => p.id);
          const allSelected = ids.every((id) => value.includes(id));
          const someSelected = ids.some((id) => value.includes(id));
          return (
            <div key={groupName} className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={() => toggleGroup(groupName)}
                    disabled={disabled}
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">{groupName}</span>
                </div>
                <Badge variant="outline">
                  {ids.filter((id) => value.includes(id)).length}/{ids.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {perms.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      disabled={disabled}
                      className="h-4 w-4 mt-0.5"
                    />
                    <div>
                      <div className="font-medium">{permLabel(p)}</div>
                      {p.description ? (
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
