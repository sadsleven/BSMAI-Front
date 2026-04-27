import type { ReactNode } from 'react';
import { FolderOpen, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA, typically a <Button> */
  action?: ReactNode;
  className?: string;
  tone?: 'blue' | 'cyan';
};

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  className,
  tone = 'blue',
}: EmptyStateProps) {
  const tint =
    tone === 'cyan'
      ? 'bg-brand-cyan-soft text-brand-cyan-strong'
      : 'bg-brand-blue-soft text-brand-blue-strong';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 gap-3',
        className,
      )}
    >
      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', tint)}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
