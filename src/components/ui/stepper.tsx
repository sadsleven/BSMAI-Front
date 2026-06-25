import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepDef = {
  id: string;
  label: string;
  description?: string;
  /** Implementado y navegable. Pasos futuros marcar como `available: false`. */
  available: boolean;
  /** Mensaje cuando `available = false`. Default: "Próximamente". */
  lockedReason?: string;
};

export type StepperProps = {
  steps: StepDef[];
  current: string;
  onSelect?: (id: string) => void;
  /**
   * IDs de pasos ya completados. Se pintan en verde aunque navegues a un paso
   * anterior (el color de "completado" no depende de la posición actual). Se
   * unen con la heurística por posición (`i < current`) para no perder el verde
   * de los pasos previos al actual.
   */
  completedIds?: string[];
};

/**
 * Wizard stepper. Convención AFMI: siempre listar todos los pasos del flujo
 * completo. Pasos no implementados llevan `available: false` y se rinden
 * deshabilitados con etiqueta "Próximamente".
 */
export function Stepper({ steps, current, onSelect, completedIds }: StepperProps) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  const completed = new Set(completedIds ?? []);
  return (
    <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const isCurrent = s.id === current;
        const isCompleted =
          !isCurrent && s.available && (completed.has(s.id) || i < currentIdx);
        const isDisabled = !s.available;
        const clickable = !!onSelect && s.available && !isCurrent;
        return (
          <li key={s.id} className="flex-1 min-w-[160px]">
            <button
              type="button"
              onClick={() => clickable && onSelect?.(s.id)}
              disabled={!clickable}
              className={cn(
                'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                isCurrent && 'border-brand-blue bg-brand-blue-soft',
                isCompleted && 'border-success bg-success-soft',
                !isCurrent && !isCompleted && !isDisabled && 'border-border bg-card hover:bg-accent',
                isDisabled && 'border-dashed border-border bg-muted/30 cursor-not-allowed',
                clickable && 'cursor-pointer',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                    isCurrent && 'bg-brand-blue text-white',
                    isCompleted && 'bg-success text-white',
                    !isCurrent && !isCompleted && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : isDisabled ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {isDisabled ? (s.lockedReason ?? 'Próximamente') : (s.description ?? '')}
                  </div>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
