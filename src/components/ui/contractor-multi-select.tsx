import { useEffect, useMemo, useState } from 'react';
import { Briefcase, X, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contractorGateway } from '@/modules/contractors/infrastructure/contractorGateway';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';
import { cn } from '@/lib/utils';

export type ContractorMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing contractors already attached (allow keeping disabled ones). */
  existing?: Contractor[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de contratistas: consume `GET /contractors/assignable`,
 * muestra chips clickables y permite filtrar por nombre.
 * Si un contratista asignado ya no es asignable (deshabilitado/papelera),
 * aparece como chip punteado, quitable, no re-agregable.
 */
export function ContractorMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: ContractorMultiSelectProps) {
  const [assignable, setAssignable] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await contractorGateway.listAssignable();
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
    const m = new Map<string, Contractor>();
    for (const c of assignable) m.set(c.id, c);
    return m;
  }, [assignable]);

  const existingById = useMemo(() => {
    const m = new Map<string, Contractor>();
    for (const c of existing ?? []) m.set(c.id, c);
    return m;
  }, [existing]);

  const stale = useMemo(
    () =>
      value
        .filter((id) => !assignableById.has(id))
        .map((id) => existingById.get(id))
        .filter((c): c is Contractor => !!c),
    [value, assignableById, existingById],
  );

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((c) => c.name.toLowerCase().includes(q));
  }, [assignable, search]);

  const labelFor = (c: Contractor) => {
    if (c.deletedAt) return `${c.name} · papelera`;
    if (c.isActive === false) return `${c.name} · deshabilitado`;
    return c.name;
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-muted-foreground" />
        Contratistas
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {value.length} seleccionado{value.length === 1 ? '' : 's'}
        </span>
      </Label>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar contratista…"
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
            No hay contratistas disponibles.
          </span>
        ) : (
          <>
            {filtered.map((c) => {
              const active = value.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  disabled={disabled}
                  className={cn(
                    'cursor-pointer transition-opacity',
                    disabled && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <Badge variant={active ? 'default' : 'outline'}>{c.name}</Badge>
                </button>
              );
            })}
            {stale.map((c) => (
              <span
                key={c.id}
                title="Contratista deshabilitado o en papelera. Solo se puede quitar."
                className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
              >
                {labelFor(c)}
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
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
          Algunos contratistas asignados no están disponibles para nuevas asignaciones;
          podés quitarlos pero no re-agregarlos.
        </p>
      )}
    </div>
  );
}
