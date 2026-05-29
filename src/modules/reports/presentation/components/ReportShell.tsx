import type { ReactNode } from 'react';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';

export type ReportShellProps = {
  title: string;
  description?: string;
  headerRight?: ReactNode;
  kpis?: ReactNode;
  children: ReactNode;
};

/** Common page chrome for reports: breadcrumbs + h1 + KPI row + content. */
export function ReportShell({
  title,
  description,
  headerRight,
  kpis,
  children,
}: ReportShellProps) {
  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {headerRight}
      </div>
      {kpis}
      {children}
    </div>
  );
}
