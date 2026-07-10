import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  AlertTriangle,
  Search,
  Check,
  Loader2,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type ChipMultiSelectOption = {
  id: string;
  label: string;
  /** Si está presente, la opción no puede agregarse (tooltip mostrará la razón). */
  disabledReason?: string;
};

export type ChipMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Opciones asignables. */
  options: ChipMultiSelectOption[];
  /** Items asignados que ya no son asignables (chip punteado, quitables, no re-agregables). */
  staleItems?: ChipMultiSelectOption[];
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  searchPlaceholder?: string;
  emptyLabel?: string;
  staleHint?: string;
  counterSuffix?: { singular: string; plural: string };
  /** Si se pasa, muestra un botón "+ crear" al pie del dropdown. */
  onCreateNew?: () => void;
  /** Etiqueta del botón crear (def "Crear nuevo"). */
  createLabel?: string;
};

const DROPDOWN_MAX_HEIGHT = 260;

/**
 * Multi-select compacto: input con dropdown de opciones y chips de los seleccionados
 * fuera del selector (también deseleccionables desde el chip). Evita saturar la UI
 * cuando hay muchas opciones disponibles.
 */
export function ChipMultiSelect({
  value,
  onChange,
  options,
  staleItems,
  loading,
  disabled,
  error,
  required,
  label,
  icon: Icon,
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'Sin resultados.',
  staleHint,
  counterSuffix = { singular: 'seleccionado', plural: 'seleccionados' },
  onCreateNew,
  createLabel = 'Crear nuevo',
}: ChipMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Posiciona el dropdown (portal fixed) anclado al input, así no lo recorta el
  // overflow de modales/contenedores scrolleables. Si abajo no cabe y arriba hay
  // más espacio, abre hacia arriba. Recalcula en scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow < DROPDOWN_MAX_HEIGHT + 8 && r.top > spaceBelow) {
        setRect({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
      } else {
        setRect({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const optionsById = useMemo(() => {
    const m = new Map<string, ChipMultiSelectOption>();
    for (const o of options) m.set(o.id, o);
    return m;
  }, [options]);

  const staleById = useMemo(() => {
    const m = new Map<string, ChipMultiSelectOption>();
    for (const o of staleItems ?? []) m.set(o.id, o);
    return m;
  }, [staleItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedChips = useMemo(
    () =>
      value
        .map((id) => optionsById.get(id))
        .filter((o): o is ChipMultiSelectOption => !!o),
    [value, optionsById],
  );

  const staleSelected = useMemo(
    () =>
      value
        .filter((id) => !optionsById.has(id))
        .map((id) => staleById.get(id))
        .filter((o): o is ChipMultiSelectOption => !!o),
    [value, optionsById, staleById],
  );

  const add = (id: string) => {
    if (disabled) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
  };
  const remove = (id: string) => {
    if (disabled) return;
    onChange(value.filter((v) => v !== id));
  };

  const totalSelected = selectedChips.length + staleSelected.length;
  const suffix =
    totalSelected === 1 ? counterSuffix.singular : counterSuffix.plural;

  return (
    <div
      className="space-y-2"
      ref={wrapRef}
      onKeyDown={(e) => {
        // El input de búsqueda vive dentro de un <form> (modales de creación
        // embebidos). Sin esto, Enter dispara el submit implícito del form
        // contenedor y Escape cierra el modal en vez del dropdown.
        if (!open) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = filtered.find(
            (o) => !value.includes(o.id) && !o.disabledReason,
          );
          if (first) add(first.id);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <Label className="text-sm font-medium flex items-center gap-2">
        {Icon ? <Icon className="w-4 h-4 text-muted-foreground" /> : null}
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {totalSelected} {suffix}
        </span>
      </Label>

      <div className="relative" ref={anchorRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          className={cn(
            'h-9 pl-9 pr-9',
            error && 'border-destructive',
          )}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <ChevronDown
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        )}

        {open && rect ? (
          createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              maxHeight: DROPDOWN_MAX_HEIGHT,
              // Radix modal pone pointer-events:none en <body>; el portal
              // necesita reactivarlos para ser clickeable dentro de modales.
              pointerEvents: 'auto',
            }}
            className="z-50 overflow-y-auto rounded-lg border bg-card shadow-md"
          >
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                {emptyLabel}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map((o) => {
                  const selected = value.includes(o.id);
                  const optionDisabled =
                    disabled || (!selected && !!o.disabledReason);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => (selected ? remove(o.id) : add(o.id))}
                        disabled={optionDisabled}
                        title={o.disabledReason ?? undefined}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                          'hover:bg-accent',
                          optionDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                          selected && 'bg-accent/60',
                        )}
                      >
                        <span
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            selected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/40',
                          )}
                        >
                          {selected ? <Check className="w-3 h-3" /> : null}
                        </span>
                        <span className="flex-1 truncate">{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {onCreateNew && !disabled ? (
              <div className="sticky bottom-0 border-t bg-card p-1">
                <button
                  type="button"
                  onClick={() => {
                    // Devuelve el foco al input (que permanece montado) antes de
                    // cerrar el dropdown, para que al cerrarse el modal de
                    // creación Radix restaure el foco a un elemento vivo y no a
                    // <body>.
                    searchRef.current?.focus();
                    onCreateNew();
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 rounded-md text-brand-blue-strong font-medium hover:bg-accent"
                >
                  <Plus className="w-4 h-4 shrink-0" /> {createLabel}
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
          )
        ) : null}
      </div>

      {totalSelected > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedChips.map((o) => (
            <Badge
              key={o.id}
              variant="default"
              className="pr-1 gap-1"
              data-icon="inline-end"
            >
              <span className="truncate">{o.label}</span>
              <button
                type="button"
                onClick={() => remove(o.id)}
                disabled={disabled}
                className="ml-0.5 rounded hover:bg-black/10 p-0.5 cursor-pointer"
                title="Quitar"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {staleSelected.map((o) => (
            <span
              key={o.id}
              title={staleHint ?? 'Opción deshabilitada o en papelera. Solo se puede quitar.'}
              className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
            >
              {o.label}
              <button
                type="button"
                onClick={() => remove(o.id)}
                disabled={disabled}
                className="ml-0.5 rounded hover:bg-accent p-0.5 cursor-pointer"
                title="Quitar"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      ) : null}
      {staleSelected.length > 0 && staleHint ? (
        <p className="text-xs text-muted-foreground">{staleHint}</p>
      ) : null}
    </div>
  );
}
