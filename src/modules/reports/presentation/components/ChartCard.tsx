import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ChartCardProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Altura del área del gráfico en px. Default 300. */
  height?: number;
  /** Mensaje a mostrar cuando no hay datos para graficar. */
  empty?: boolean;
  emptyText?: string;
  className?: string;
  children: ReactNode;
};

/** Tarjeta contenedora de un gráfico: chrome + título + área de canvas con altura fija. */
export function ChartCard({
  title,
  description,
  icon: Icon,
  height = 300,
  empty = false,
  emptyText = 'Sin datos para mostrar',
  className,
  children,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border shadow-xs p-5 flex flex-col min-w-0',
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-4">
        {Icon ? (
          <div className="w-9 h-9 rounded-lg bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="relative flex-1" style={{ height }}>
        {empty ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
