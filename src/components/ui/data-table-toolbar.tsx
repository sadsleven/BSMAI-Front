import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DataTableToolbarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter controls (e.g. Select, Combobox) rendered after the search */
  filters?: ReactNode;
  /** Right-side slot for primary actions */
  actions?: ReactNode;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  className?: string;
};

/**
 * Barra de búsqueda + filtros de las tablas.
 *
 * Dos zonas: a la izquierda búsqueda y filtros (envuelven entre sí cuando no
 * caben), a la derecha las acciones, ancladas arriba para que no "floten" en
 * una fila suelta cuando hay muchos filtros.
 */
export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  filters,
  actions,
  hasActiveFilters,
  onClear,
  className,
}: DataTableToolbarProps) {
  const showSearch = onSearchChange !== undefined;
  const showClear = Boolean(hasActiveFilters && onClear);

  return (
    <div
      className={cn(
        'px-4 py-3 border-b flex flex-col gap-3',
        className,
      )}
    >
      {/* Fila superior: filtros + acciones */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
          {showSearch && (
            <div className="relative w-full min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 h-9"
              />
            </div>
          )}

          {filters}

          {showClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-9 gap-1 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </Button>
          )}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
