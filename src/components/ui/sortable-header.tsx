import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type SortDir = 'ASC' | 'DESC';

interface Props<T extends string> {
  column: T;
  activeColumn?: T | null;
  direction?: SortDir | null;
  onSort: (column: T, nextDir: SortDir) => void;
  children: ReactNode;
}

/**
 * Standard table-header sort control. Click to toggle ASC/DESC.
 * Always render this inside a `<TableHead>` — no external sort controls.
 */
export function SortableHeader<T extends string>({
  column,
  activeColumn,
  direction,
  onSort,
  children,
}: Props<T>) {
  const isActive = activeColumn === column;
  const next: SortDir = isActive && direction === 'ASC' ? 'DESC' : 'ASC';
  const Icon = !isActive ? ArrowUpDown : direction === 'ASC' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column, next)}
      className="inline-flex items-center gap-1 hover:text-foreground [font:inherit] [letter-spacing:inherit] [text-transform:inherit] text-inherit"
      aria-sort={!isActive ? 'none' : direction === 'ASC' ? 'ascending' : 'descending'}
    >
      {children}
      <Icon className={`w-3 h-3 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
    </button>
  );
}
