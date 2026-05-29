import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiTone =
  | 'blue'
  | 'cyan'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'neutral';

export type KpiCardProps = {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  className?: string;
};

const TONE_TINT: Record<KpiTone, string> = {
  blue: 'bg-brand-blue-soft text-brand-blue-strong',
  cyan: 'bg-brand-cyan-soft text-brand-cyan-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  destructive: 'bg-destructive-soft text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border shadow-xs p-4 flex items-start gap-3 min-w-0',
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            TONE_TINT[tone],
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate">
          {label}
        </div>
        <div className="text-[20px] font-bold tracking-[-0.01em] text-foreground truncate">
          {value}
        </div>
        {hint ? (
          <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

export type KpiRowProps = {
  items: KpiCardProps[];
  className?: string;
};

export function KpiRow({ items, className }: KpiRowProps) {
  return (
    <div
      className={cn(
        'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((it, i) => (
        <KpiCard key={`${it.label}-${i}`} {...it} />
      ))}
    </div>
  );
}
