import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Info, type LucideIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfirmTone = 'destructive' | 'warning' | 'success' | 'info';

const TONE: Record<
  ConfirmTone,
  { iconBg: string; iconText: string; banner: string; bannerText: string }
> = {
  destructive: {
    iconBg: 'bg-destructive-soft',
    iconText: 'text-destructive',
    banner: 'bg-warning-soft border-warning/30',
    bannerText: 'text-warning',
  },
  warning: {
    iconBg: 'bg-warning-soft',
    iconText: 'text-warning',
    banner: 'bg-warning-soft border-warning/30',
    bannerText: 'text-warning',
  },
  success: {
    iconBg: 'bg-success-soft',
    iconText: 'text-success',
    banner: 'bg-brand-blue-soft border-brand-blue/30',
    bannerText: 'text-brand-blue-strong',
  },
  info: {
    iconBg: 'bg-brand-blue-soft',
    iconText: 'text-brand-blue-strong',
    banner: 'bg-brand-blue-soft border-brand-blue/30',
    bannerText: 'text-brand-blue-strong',
  },
};

export function DialogIconHeader({
  tone = 'info',
  icon: Icon = AlertTriangle,
  title,
  description,
  onClose,
}: {
  tone?: ConfirmTone;
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  onClose?: () => void;
}) {
  const t = TONE[tone];
  return (
    <AlertDialogHeader className="px-6 pt-5 gap-3">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            t.iconBg,
            t.iconText,
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
            {title}
          </AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {description}
            </AlertDialogDescription>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground -mt-0.5 -mr-1 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </AlertDialogHeader>
  );
}

export function DialogBanner({
  tone = 'warning',
  children,
}: {
  tone?: ConfirmTone;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        t.banner,
        t.bannerText,
      )}
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: ConfirmTone;
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Optional info banner shown below description */
  banner?: ReactNode;
  /** Require checkbox confirmation before enabling primary action */
  requireConfirmCheckbox?: boolean;
  confirmCheckboxLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Override variant of the confirm button (defaults: destructive→destructive, others→default) */
  confirmVariant?: 'default' | 'destructive';
};

export function ConfirmDialog({
  open,
  onOpenChange,
  tone = 'info',
  icon: Icon = AlertTriangle,
  title,
  description,
  banner,
  requireConfirmCheckbox,
  confirmCheckboxLabel = 'Entiendo que esta acción es permanente.',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading,
  onConfirm,
  confirmVariant,
}: ConfirmDialogProps) {
  const [checked, setChecked] = useState(false);
  const t = TONE[tone];
  const variant: 'default' | 'destructive' =
    confirmVariant ?? (tone === 'destructive' ? 'destructive' : 'default');

  // Reset checkbox each time the dialog opens
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  const disabled = loading || (requireConfirmCheckbox && !checked);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[460px] rounded-xl gap-4 p-0">
        <AlertDialogHeader className="px-6 pt-5 gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                t.iconBg,
                t.iconText,
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                {title}
              </AlertDialogTitle>
              {description ? (
                <AlertDialogDescription className="text-sm text-muted-foreground">
                  {description}
                </AlertDialogDescription>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar"
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground -mt-0.5 -mr-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </AlertDialogHeader>

        {(banner || requireConfirmCheckbox) && (
          <div className="px-6 space-y-3">
            {banner ? (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                  t.banner,
                  t.bannerText,
                )}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{banner}</div>
              </div>
            ) : null}
            {requireConfirmCheckbox ? (
              <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-input accent-[var(--brand-blue)]"
                />
                <span className="text-foreground">{confirmCheckboxLabel}</span>
              </label>
            ) : null}
          </div>
        )}

        <AlertDialogFooter className="px-6 pb-5 pt-2">
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              if (disabled) return;
              void onConfirm();
            }}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
