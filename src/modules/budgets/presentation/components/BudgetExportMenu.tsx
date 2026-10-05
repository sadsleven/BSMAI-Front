import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notify } from '@/lib/notifications/toast';
import {
  BUDGET_TEMPLATE_LABEL,
  budgetTemplatesFor,
  type Budget,
  type BudgetTemplate,
} from '../../domain/models/budget';
import { downloadBudgetXlsx } from './budgetExcel';
import { downloadBudgetPdf } from './budgetPdf';

/**
 * Descarga del presupuesto. Ofrece las plantillas que aplican al presupuesto
 * (la de SEGUROS y la solicitud APS sólo tienen sentido con seguro) × los dos
 * formatos. El contenido de ambos formatos es el mismo: sólo cambia el archivo.
 */
export function BudgetExportMenu({
  budget,
  variant = 'default',
  size,
}: {
  budget: Budget;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'icon';
}) {
  const [busy, setBusy] = useState(false);
  const templates = budgetTemplatesFor(budget);

  const run = async (
    template: BudgetTemplate,
    format: 'xlsx' | 'pdf',
  ): Promise<void> => {
    setBusy(true);
    try {
      if (format === 'xlsx') await downloadBudgetXlsx(budget, template);
      else await downloadBudgetPdf(budget, template);
    } catch (e) {
      notify.fromError(
        e,
        `No se pudo generar el ${format === 'xlsx' ? 'Excel' : 'PDF'}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy} className="gap-1.5">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {size === 'icon' ? null : 'Descargar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {templates.map((t, i) => (
          <div key={t}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {BUDGET_TEMPLATE_LABEL[t]}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void run(t, 'xlsx')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void run(t, 'pdf')}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
