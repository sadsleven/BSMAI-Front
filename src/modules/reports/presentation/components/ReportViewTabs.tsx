import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ReportViewTabsOption<T extends string> = {
  value: T;
  label: string;
};

export type ReportViewTabsProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly ReportViewTabsOption<T>[];
  /** Contenido alineado a la derecha de la banda (contadores, totales…). */
  right?: ReactNode;
};

/**
 * Banda de cambio de vista (Resumen / Detalle) de los reportes.
 * Control segmentado custom con look limpio: los tabs se ven como botones
 * dentro de una pista, con el activo destacado. Altura h-9 coherente con
 * el resto de controles del toolbar.
 */
export function ReportViewTabs<T extends string>({
  value,
  onChange,
  options,
  right,
}: ReportViewTabsProps<T>) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/30">
      <div className="inline-flex h-9 items-center rounded-lg border bg-background p-0.5 shadow-xs">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex items-center justify-center rounded-md px-3.5 text-sm font-medium transition-all h-full',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {right ? (
        <div className="text-xs text-muted-foreground whitespace-nowrap font-medium">{right}</div>
      ) : null}
    </div>
  );
}
