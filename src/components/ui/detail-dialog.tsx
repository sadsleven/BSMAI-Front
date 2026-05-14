import { type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { ConfirmTone } from '@/components/ui/confirm-dialog';
import { Eye, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE_BG: Record<ConfirmTone, { bg: string; text: string }> = {
  destructive: { bg: 'bg-destructive-soft', text: 'text-destructive' },
  warning: { bg: 'bg-warning-soft', text: 'text-warning' },
  success: { bg: 'bg-success-soft', text: 'text-success' },
  info: { bg: 'bg-brand-blue-soft', text: 'text-brand-blue-strong' },
};

export type DetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: ConfirmTone;
  icon?: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
  /** Width override; defaults to 1280px. Use `data-[size=default]:sm:max-w-[Npx]` to outrank builtin `max-w-lg`. */
  maxWidth?: string;
  closeLabel?: string;
};

export function DetailDialog({
  open,
  onOpenChange,
  tone = 'info',
  icon: Icon = Eye,
  title,
  subtitle,
  loading,
  children,
  maxWidth = 'data-[size=default]:sm:max-w-[800px]',
  closeLabel = 'Cerrar',
}: DetailDialogProps) {
  const t = TONE_BG[tone];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          maxWidth,
          'rounded-xl gap-4 p-0 max-h-[85vh] overflow-hidden flex flex-col',
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <AlertDialogHeader className="px-6 pt-5 pr-12 gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                t.bg,
                t.text,
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                {title}
              </AlertDialogTitle>
              {subtitle ? (
                <AlertDialogDescription className="text-sm text-muted-foreground">
                  {subtitle}
                </AlertDialogDescription>
              ) : null}
            </div>
          </div>
        </AlertDialogHeader>
        <div className="px-6 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
          ) : (
            children
          )}
        </div>
        <AlertDialogFooter className="px-6 pb-5 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('py-3', className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-foreground break-words',
          mono && 'font-mono',
          isEmpty && 'text-muted-foreground italic',
        )}
      >
        {isEmpty ? '—' : value}
      </span>
    </div>
  );
}

export function DetailBadge({
  tone = 'info',
  children,
}: {
  tone?: 'success' | 'warning' | 'destructive' | 'info' | 'neutral';
  children: ReactNode;
}) {
  const map = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    destructive: 'bg-destructive-soft text-destructive',
    info: 'bg-brand-blue-soft text-brand-blue-strong',
    neutral: 'bg-muted text-muted-foreground',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        map[tone],
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'destructive' && 'bg-destructive',
          tone === 'info' && 'bg-brand-blue',
          tone === 'neutral' && 'bg-muted-foreground',
        )}
      />
      {children}
    </span>
  );
}
