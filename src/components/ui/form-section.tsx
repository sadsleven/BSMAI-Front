import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Right-aligned slot in the section header */
  headerAction?: ReactNode;
  /** Bottom slot rendered with a top border */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * When true, drops `overflow-hidden` on the card so descendant popovers/dropdowns
   * (custom autocompletes anchored absolute) don't get clipped.
   */
  allowOverflow?: boolean;
};

export function FormSection({
  title,
  description,
  children,
  headerAction,
  footer,
  className,
  contentClassName,
  allowOverflow,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        'bg-card rounded-xl border shadow-xs',
        allowOverflow ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
    >
      <header className="px-6 py-4 border-b flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {headerAction}
      </header>
      <div className={cn('p-6', contentClassName)}>{children}</div>
      {footer ? (
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between gap-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export type FormGridProps = {
  children: ReactNode;
  className?: string;
};

/** 2-column responsive grid for form fields. Use `col-span-2` on a child for full width. */
export function FormGrid({ children, className }: FormGridProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]', className)}>
      {children}
    </div>
  );
}
