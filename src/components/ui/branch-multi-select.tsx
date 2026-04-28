import { useEffect, useMemo, useState } from 'react';
import { Building, X, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { branchGateway } from '@/modules/branches/infrastructure/branchGateway';
import type { Branch } from '@/modules/branches/domain/models/branch';
import { cn } from '@/lib/utils';

export type BranchMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing branches already attached (allow keeping disabled ones). */
  existing?: Branch[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de sucursales. Mismo patrón que `<InsuranceMultiSelect>` y
 * `<ContractorMultiSelect>`: consume `GET /branches/assignable`, mantiene
 * stale chips quitables/no re-agregables.
 */
export function BranchMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: BranchMultiSelectProps) {
  const [assignable, setAssignable] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await branchGateway.listAssignable();
        if (!cancelled) setAssignable(list);
      } catch {
        if (!cancelled) setAssignable([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignableById = useMemo(() => {
    const m = new Map<string, Branch>();
    for (const b of assignable) m.set(b.id, b);
    return m;
  }, [assignable]);

  const existingById = useMemo(() => {
    const m = new Map<string, Branch>();
    for (const b of existing ?? []) m.set(b.id, b);
    return m;
  }, [existing]);

  const stale = useMemo(
    () =>
      value
        .filter((id) => !assignableById.has(id))
        .map((id) => existingById.get(id))
        .filter((b): b is Branch => !!b),
    [value, assignableById, existingById],
  );

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((b) => b.name.toLowerCase().includes(q));
  }, [assignable, search]);

  const labelFor = (b: Branch) => {
    if (b.deletedAt) return `${b.name} · papelera`;
    if (b.isActive === false) return `${b.name} · deshabilitada`;
    return b.name;
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Building className="w-4 h-4 text-muted-foreground" />
        Sucursales
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {value.length} seleccionada{value.length === 1 ? '' : 's'}
        </span>
      </Label>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar sucursal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-9"
          disabled={disabled}
        />
      </div>

      <div
        className={cn(
          'min-h-[80px] flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/20',
          error && 'border-destructive',
        )}
      >
        {loading ? (
          <span className="text-sm text-muted-foreground">Cargando…</span>
        ) : assignable.length === 0 && stale.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No hay sucursales disponibles.
          </span>
        ) : (
          <>
            {filtered.map((b) => {
              const active = value.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.id)}
                  disabled={disabled}
                  className={cn(
                    'cursor-pointer transition-opacity',
                    disabled && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <Badge variant={active ? 'default' : 'outline'}>{b.name}</Badge>
                </button>
              );
            })}
            {stale.map((b) => (
              <span
                key={b.id}
                title="Sucursal deshabilitada o en papelera. Sólo se puede quitar."
                className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
              >
                {labelFor(b)}
                <button
                  type="button"
                  onClick={() => toggle(b.id)}
                  disabled={disabled}
                  className="ml-1 rounded hover:bg-accent p-0.5"
                  title="Quitar"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
      {stale.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Algunas sucursales asignadas no están disponibles para nuevas asignaciones;
          podés quitarlas pero no re-agregarlas.
        </p>
      )}
    </div>
  );
}
