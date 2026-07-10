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

  return (
    <div
      className={cn(
        'px-4 pt-4 pb-4 flex items-center gap-3 flex-wrap',
        className,
      )}
    >
      {showSearch && (
        <div className="relative w-full max-w-[320px]">
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

      {filters && <div className="flex items-center gap-2 flex-wrap">{filters}</div>}

      <div className="ml-auto flex items-center gap-2">
        {hasActiveFilters && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
            <X className="w-3.5 h-3.5" />
            Limpiar filtros
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
