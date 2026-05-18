import { useEffect, useMemo, useState } from 'react';
import { Shield, X, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import { cn } from '@/lib/utils';

export type InsuranceMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing insurances already attached (allow keeping disabled ones). */
  existing?: Insurance[];
  error?: string;
  disabled?: boolean;
  /**
   * IDs deshabilitados con motivo. Aparecen visibles pero no clickeables;
   * el tooltip muestra la razón. Si ya están seleccionados, se muestran como
   * stale (quitables, no re-agregables).
   */
  disabledOptions?: Map<string, string>;
  /** Texto cabecera (default: "Seguros"). */
  label?: string;
};

/**
 * Multi-select de seguros: consume `GET /insurances/assignable`,
 * muestra chips clickables y permite filtrar por nombre.
 * Si un seguro asignado ya no es asignable (deshabilitado/papelera),
 * aparece como chip punteado, quitable, no re-agregable.
 */
export function InsuranceMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
  disabledOptions,
  label,
}: InsuranceMultiSelectProps) {
  const [assignable, setAssignable] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await insuranceGateway.listAssignable();
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
    const m = new Map<string, Insurance>();
    for (const s of assignable) m.set(s.id, s);
    return m;
  }, [assignable]);

  const existingById = useMemo(() => {
    const m = new Map<string, Insurance>();
    for (const s of existing ?? []) m.set(s.id, s);
    return m;
  }, [existing]);

  const stale = useMemo(
    () =>
      value
        .filter((id) => !assignableById.has(id))
        .map((id) => existingById.get(id))
        .filter((s): s is Insurance => !!s),
    [value, assignableById, existingById],
  );

  const toggle = (id: string) => {
    if (disabled) return;
    const selected = value.includes(id);
    // Bloquear agregar si está en disabledOptions; quitar sigue permitido.
    if (!selected && disabledOptions?.has(id)) return;
    onChange(selected ? value.filter((v) => v !== id) : [...value, id]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter((s) => s.name.toLowerCase().includes(q));
  }, [assignable, search]);

  const labelFor = (s: Insurance) => {
    if (s.deletedAt) return `${s.name} · papelera`;
    if (s.isActive === false) return `${s.name} · deshabilitado`;
    return s.name;
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Shield className="w-4 h-4 text-muted-foreground" />
        {label ?? 'Seguros'}
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {value.length} seleccionado{value.length === 1 ? '' : 's'}
        </span>
      </Label>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar seguro…"
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
            No hay seguros disponibles.
          </span>
        ) : (
          <>
            {filtered.map((s) => {
              const active = value.includes(s.id);
              const disabledReason = disabledOptions?.get(s.id);
              const optionDisabled = disabled || (!active && !!disabledReason);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  disabled={optionDisabled}
                  title={disabledReason ?? undefined}
                  className={cn(
                    'cursor-pointer transition-opacity',
                    optionDisabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <Badge variant={active ? 'default' : 'outline'}>{s.name}</Badge>
                </button>
              );
            })}
            {stale.map((s) => (
              <span
                key={s.id}
                title="Seguro deshabilitado o en papelera. Solo se puede quitar."
                className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
              >
                {labelFor(s)}
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
          Algunos seguros asignados no están disponibles para nuevas asignaciones;
          podés quitarlos pero no re-agregarlos.
        </p>
      )}
    </div>
  );
}
