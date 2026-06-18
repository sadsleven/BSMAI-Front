import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

export type DataTablePaginationProps = {
  /** 1-based current page */
  page: number;
  pageSize: number;
  total: number;
  /** Optional; computed as ceil(total/pageSize) when omitted */
  lastPage?: number;
  onPageChange: (page: number) => void;
  /** When provided, renders a page-size selector. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Label noun, e.g. "usuarios", "roles" */
  itemLabel?: string;
  className?: string;
};

function buildPageWindow(current: number, last: number): (number | 'ellipsis')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);

  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < last - 1) pages.push('ellipsis');

  pages.push(last);
  return pages;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  lastPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = 'registros',
  className,
}: DataTablePaginationProps) {
  const last = lastPage ?? Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), last);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const pages = buildPageWindow(safePage, last);

  return (
    <div
      className={cn(
        'p-4 border-t bg-muted/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3',
        className,
      )}
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{from.toLocaleString()}</span>–
          <span className="font-medium text-foreground">{to.toLocaleString()}</span> de{' '}
          <span className="font-medium text-foreground">{total.toLocaleString()}</span> {itemLabel}
        </div>
        {onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="w-8 h-8"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              className="w-8 h-8 inline-flex items-center justify-center text-muted-foreground text-sm"
            >
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              variant={p === safePage ? 'default' : 'outline'}
              size="icon"
              className="w-8 h-8 text-sm"
              onClick={() => onPageChange(p)}
              aria-current={p === safePage ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="w-8 h-8"
          disabled={safePage >= last}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
