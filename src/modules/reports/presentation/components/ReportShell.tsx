import type { ReactNode } from 'react';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';

export type ReportShellProps = {
  title: string;
  description?: string;
  kpis?: ReactNode;
  children: ReactNode;
};

/** Common page chrome for reports: breadcrumbs + h1 + KPI row + content. */
export function ReportShell({
  title,
  description,
  kpis,
  children,
}: ReportShellProps) {
  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="space-y-1">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {kpis}
      {children}
    </div>
  );
}
