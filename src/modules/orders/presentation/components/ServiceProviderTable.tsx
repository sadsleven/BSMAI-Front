import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, AlertTriangle, Search, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProviderSearchSelect, type ProviderSelectValue } from './ProviderSearchSelect';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';

export type ServiceProviderRowValue = {
  serviceTypeId: string;
  providerType: 'doctor' | 'care_center';
  doctorId?: string;
  careCenterId?: string;
  quantity?: number;
};

export type ServiceProviderRowErrors = {
  serviceTypeId?: string;
  providerType?: string;
  doctorId?: string;
  careCenterId?: string;
  quantity?: string;
};

export type ServiceProviderTableProps = {
  value: ServiceProviderRowValue[];
  onChange: (next: ServiceProviderRowValue[]) => void;
  serviceTypes: ServiceType[];
  /** Errores Zod por fila. */
  errors?: Array<ServiceProviderRowErrors | undefined>;
  /** Hidrata el chip de proveedor en modo edición. Map key `${type}:${id}`. */
  initialProviders?: Map<string, Doctor | CareCenter>;
  disabled?: boolean;
};

/**
 * Tabla de filas Tipo de Servicio + Proveedor para el Paso 1 de Órdenes.
 * Cada fila independiente: cambia ST/proveedor sin afectar las demás.
 * Selector de ST excluye los ya elegidos.
 */
export function ServiceProviderTable({
  value,
  onChange,
  serviceTypes,
  errors,
  initialProviders,
  disabled,
}: ServiceProviderTableProps) {
  const stById = useMemo(() => {
    const m = new Map<string, ServiceType>();
    for (const s of serviceTypes) m.set(s.id, s);
    return m;
  }, [serviceTypes]);

  const usedIds = useMemo(
    () => new Set(value.map((r) => r.serviceTypeId).filter(Boolean)),
    [value],
  );

  // Mostrar columna Cantidad sólo si algún ST disponible la permite.
  const showQuantityColumn = useMemo(
    () => serviceTypes.some((s) => s.allowsQuantity),
    [serviceTypes],
  );

  // Cache per-row del objeto provider para mostrar chip en ProviderSearchSelect.
  // Las filas se identifican por índice; al agregar/quitar reordenamos el cache.
  const [providerCache, setProviderCache] = useState<Array<ProviderSelectValue | null>>(
    () =>
      value.map((r) => seedProviderValue(r, initialProviders)),
  );

  // Re-seed si initialProviders cambia (load tardío) o size de filas cambia externamente.
  useEffect(() => {
    setProviderCache((prev) => {
      const next = value.map((r, i) => {
        const cached = prev[i];
        if (cached) {
          // Si el ID ya no coincide, descartar.
          if (
            (r.providerType === 'doctor' && cached.providerType === 'doctor' && cached.doctor.id === r.doctorId) ||
            (r.providerType === 'care_center' && cached.providerType === 'care_center' && cached.careCenter.id === r.careCenterId)
          ) {
            return cached;
          }
        }
        return seedProviderValue(r, initialProviders);
      });
      return next;
    });
  }, [value, initialProviders]);

  const addRow = () => {
    onChange([
      ...value,
      { serviceTypeId: '', providerType: 'doctor' },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<ServiceProviderRowValue>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const setRowProvider = (idx: number, pv: ProviderSelectValue | null) => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? pv : x)));
    if (!pv) {
      updateRow(idx, { doctorId: undefined, careCenterId: undefined });
      return;
    }
    if (pv.providerType === 'doctor') {
      updateRow(idx, {
        providerType: 'doctor',
        doctorId: pv.doctor.id,
        careCenterId: undefined,
      });
    } else {
      updateRow(idx, {
        providerType: 'care_center',
        careCenterId: pv.careCenter.id,
        doctorId: undefined,
      });
    }
  };

  const setRowProviderType = (idx: number, pt: 'doctor' | 'care_center') => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? null : x)));
    updateRow(idx, {
      providerType: pt,
      doctorId: undefined,
      careCenterId: undefined,
    });
  };

  const distinctProviders = useMemo(() => {
    const set = new Set<string>();
    for (const r of value) {
      const id = r.providerType === 'doctor' ? r.doctorId : r.careCenterId;
      if (id) set.add(`${r.providerType}:${id}`);
    }
    return set.size;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Cada Tipo de Servicio tiene su propio proveedor. Cambiar uno no afecta a los demás.
        </p>
        {distinctProviders > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {distinctProviders} proveedor{distinctProviders === 1 ? '' : 'es'}
          </Badge>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay Tipos de Servicio. Agregá al menos uno.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-[oklch(0.985_0.003_250)]">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground w-[34%]">
                  Tipo de Servicio
                </th>
                <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Proveedor
                </th>
                {showQuantityColumn ? (
                  <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground w-28">
                    Cantidad
                  </th>
                ) : null}
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {value.map((row, idx) => {
                const rowError = errors?.[idx];
                const available = serviceTypes.filter(
                  (s) => !usedIds.has(s.id) || s.id === row.serviceTypeId,
                );
                const currentST = row.serviceTypeId ? stById.get(row.serviceTypeId) : null;
                const cachedProvider = providerCache[idx] ?? null;
                return (
                  <tr key={idx} className="border-t align-top">
                    <td className="px-4 py-3">
                      <ServiceTypeSelect
                        value={row.serviceTypeId || ''}
                        options={available.map((s) => ({ id: s.id, label: s.name }))}
                        onChange={(v) => {
                          const st = stById.get(v);
                          updateRow(idx, {
                            serviceTypeId: v,
                            quantity: st?.allowsQuantity ? row.quantity ?? 1 : undefined,
                          });
                        }}
                        disabled={disabled}
                        invalid={!!rowError?.serviceTypeId}
                      />
                      {rowError?.serviceTypeId && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {rowError.serviceTypeId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="inline-flex rounded-md border p-0.5 gap-0.5">
                          {(['doctor', 'care_center'] as const).map((pt) => (
                            <button
                              key={pt}
                              type="button"
                              onClick={() => setRowProviderType(idx, pt)}
                              disabled={disabled}
                              className={cn(
                                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                                row.providerType === pt
                                  ? 'bg-brand-blue-soft text-brand-blue-strong'
                                  : 'text-muted-foreground hover:bg-accent',
                              )}
                            >
                              {pt === 'doctor' ? 'Doctor' : 'Centro'}
                            </button>
                          ))}
                        </div>
                        <ProviderSearchSelect
                          providerType={row.providerType}
                          value={cachedProvider}
                          onChange={(pv) => setRowProvider(idx, pv)}
                          disabled={disabled}
                          hideLabel
                          compact
                          error={rowError?.doctorId ?? rowError?.careCenterId}
                        />
                      </div>
                    </td>
                    {showQuantityColumn ? (
                      <td className="px-4 py-3 align-top">
                        {currentST?.allowsQuantity ? (
                          <>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={row.quantity ?? 1}
                              onChange={(e) => {
                                const n = Math.trunc(Number(e.target.value));
                                updateRow(idx, {
                                  quantity: Number.isFinite(n) && n >= 1 ? n : 1,
                                });
                              }}
                              disabled={disabled}
                              className={cn(
                                'h-9 w-24',
                                rowError?.quantity && 'border-destructive',
                              )}
                            />
                            {rowError?.quantity && (
                              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {rowError.quantity}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={disabled}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-40"
                        title="Quitar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Tipo de Servicio
      </Button>
    </div>
  );
}

/**
 * Selector de Tipo de Servicio con buscador (combobox single-select).
 * Mismo patrón que `ProviderSearchSelect`/`ChipMultiSelect`: trigger + dropdown
 * en portal anclado (evita recorte dentro del overflow de la tabla) + filtro local.
 */
function ServiceTypeSelect({
  value,
  options,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Posiciona el dropdown (portal fixed) anclado al trigger. Recalcula en scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((v) => {
      const next = !v;
      if (next) setQuery(''); // arranca la búsqueda limpia en cada apertura
      return next;
    });
  };

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === value)?.label ?? '',
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={wrapRef}>
      <div ref={anchorRef}>
        <button
          type="button"
          onClick={toggleOpen}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            invalid && 'border-destructive',
          )}
        >
          <span
            className={cn(
              'line-clamp-1 truncate text-left',
              !selectedLabel && 'text-muted-foreground',
            )}
          >
            {selectedLabel || 'Seleccioná un servicio'}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
      {open && rect
        ? createPortal(
            <div
              ref={dropdownRef}
              style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
              className="z-50 overflow-hidden rounded-lg border bg-card shadow-md"
            >
              <div className="relative border-b p-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  autoFocus
                  placeholder="Buscar servicio…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 pl-9"
                />
              </div>
              <div className="max-h-[232px] overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {options.length === 0
                      ? 'Sin más servicios disponibles.'
                      : 'Sin resultados.'}
                  </div>
                ) : (
                  <ul>
                    {filtered.map((o) => {
                      const selected = o.id === value;
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(o.id);
                              setOpen(false);
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent',
                              selected && 'bg-accent/60',
                            )}
                          >
                            <Check
                              className={cn(
                                'size-4 shrink-0',
                                selected ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="flex-1 truncate">{o.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function seedProviderValue(
  row: ServiceProviderRowValue,
  initialProviders?: Map<string, Doctor | CareCenter>,
): ProviderSelectValue | null {
  if (!initialProviders) return null;
  if (row.providerType === 'doctor' && row.doctorId) {
    const obj = initialProviders.get(`doctor:${row.doctorId}`);
    if (obj && 'firstName' in obj) {
      return { providerType: 'doctor', doctor: obj as Doctor };
    }
  }
  if (row.providerType === 'care_center' && row.careCenterId) {
    const obj = initialProviders.get(`care_center:${row.careCenterId}`);
    if (obj && 'businessName' in obj) {
      return { providerType: 'care_center', careCenter: obj as CareCenter };
    }
  }
  return null;
}
