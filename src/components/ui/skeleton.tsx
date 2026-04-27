import { cn } from '@/lib/utils';
import { TableCell, TableRow } from '@/components/ui/table';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/60',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-[skeleton_1.5s_ease-in-out_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export type SkeletonTableRowsProps = {
  rows?: number;
  columns: number;
};

/** Render N table rows with skeleton placeholders. Use inside <TableBody>. */
export function SkeletonTableRows({ rows = 5, columns }: SkeletonTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={`sk-${r}`}>
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={`sk-${r}-${c}`} className="py-3.5 px-4">
              <Skeleton className="h-4 w-full max-w-[180px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
