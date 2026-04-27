import { useEffect, useMemo, useState } from 'react';
import { Stethoscope, X, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { specialtyGateway } from '@/modules/specialties/infrastructure/specialtyGateway';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import { cn } from '@/lib/utils';

export type SpecialtyMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing specialties already attached (allow keeping disabled ones). */
  existing?: Specialty[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de especialidades: consume `GET /specialties/assignable`,
 * muestra chips clickables y permite filtrar por nombre.
 * Si una especialidad asignada ya no es asignable (deshabilitada/papelera),
 * aparece como chip punteado, quitable, no re-agregable.
 */
export function SpecialtyMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: SpecialtyMultiSelectProps) {
  const [assignable, setAssignable] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await specialtyGateway.listAssignable();
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
    const m = new Map<string, Specialty>();
    for (const s of assignable) m.set(s.id, s);
    return m;
  }, [assignable]);

  const existingById = useMemo(() => {
    const m = new Map<string, Specialty>();
    for (const s of existing ?? []) m.set(s.id, s);
    return m;
  }, [existing]);

  const stale = useMemo(
    () =>
      value
        .filter((id) => !assignableById.has(id))
        .map((id) => existingById.get(id))
        .filter((s): s is Specialty => !!s),
    [value, assignableById, existingById],
  );

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((s) => s.name.toLowerCase().includes(q));
  }, [assignable, search]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Stethoscope className="w-4 h-4 text-muted-foreground" />
        Especialidades <span className="text-destructive">*</span>
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {value.length} seleccionada{value.length === 1 ? '' : 's'}
        </span>
      </Label>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar especialidad…"
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
            No hay especialidades disponibles.
          </span>
        ) : (
          <>
            {filtered.map((s) => {
              const active = value.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  disabled={disabled}
                  className={cn(
                    'cursor-pointer transition-opacity',
                    disabled && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <Badge variant={active ? 'default' : 'outline'}>{s.name}</Badge>
                </button>
              );
            })}
            {stale.map((s) => (
              <span
                key={s.id}
                title="Especialidad deshabilitada o en papelera. Solo se puede quitar."
                className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
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
          Algunas especialidades asignadas no están disponibles para nuevas
          asignaciones; podés quitarlas pero no re-agregarlas.
        </p>
      )}
    </div>
  );
}
