import type { ReactNode } from 'react';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';

export type ReportShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * Common page chrome for reports: breadcrumbs + h1 + content.
 *
 * Los reportes no llevan fila de KPIs arriba (pedido del cliente, 13/11/2026):
 * los totales viven en el cuadro resumen y en el pie de la tabla. El panel
 * ejecutivo es la excepción y arma sus propios `KpiRow` dentro del contenido.
 */
export function ReportShell({ title, description, children }: ReportShellProps) {
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
      {children}
    </div>
  );
}
