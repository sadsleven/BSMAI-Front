import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import {
  BUDGET_TEMPLATE_LABEL,
  budgetTemplatesFor,
  type Budget,
  type BudgetTemplate,
} from '../../domain/models/budget';
import { downloadBudgetXlsx } from './budgetExcel';
import { downloadBudgetPdf } from './budgetPdf';

type Format = 'xlsx' | 'pdf';

/** Qué es cada plantilla, en una línea, para no tener que abrirla y ver. */
const TEMPLATE_HINT: Record<BudgetTemplate, string> = {
  insurance: 'Dirigido a la aseguradora, montos en dólares y cuenta de pago.',
  patient: 'Para entregar al paciente.',
  aps: 'Formulario de solicitud de servicio de Seguros Altamira.',
};

/**
 * Botón de un formato. El color y el icono son los de la aplicación que abre
 * el archivo (verde Excel, rojo Acrobat) para que se distingan de un vistazo.
 */
function FormatButton({
  format,
  busy,
  disabled,
  onClick,
}: {
  format: Format;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isExcel = format === 'xlsx';
  const Icon = busy ? Loader2 : isExcel ? FileSpreadsheet : FileText;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isExcel
          ? 'border-excel/30 bg-excel-soft text-excel hover:bg-excel hover:text-white'
          : 'border-pdf/30 bg-pdf-soft text-pdf hover:bg-pdf hover:text-white',
      )}
    >
      <Icon className={cn('h-4 w-4', busy && 'animate-spin')} />
      {isExcel ? 'Excel' : 'PDF'}
    </button>
  );
}

/**
 * Card de descargas del detalle del presupuesto: una fila por plantilla
 * aplicable, con sus dos formatos. El contenido de Excel y PDF es el mismo;
 * sólo cambia el archivo.
 */
export function BudgetDownloadCard({ budget }: { budget: Budget }) {
  // `${template}:${format}` de la descarga en curso — sólo una a la vez para
  // que el navegador no dispare varios "guardar como" encimados.
  const [busy, setBusy] = useState<string | null>(null);
  // Bolívares en la plantilla PACIENTE. Por defecto sí: es como se entrega.
  const [includeBs, setIncludeBs] = useState(true);
  const templates = budgetTemplatesFor(budget);

  const run = async (template: BudgetTemplate, format: Format) => {
    setBusy(`${template}:${format}`);
    try {
      // La opción sólo aplica a la plantilla del paciente; las otras van en $.
      const options = { includeBs: template === 'patient' ? includeBs : false };
      if (format === 'xlsx') await downloadBudgetXlsx(budget, template, options);
      else await downloadBudgetPdf(budget, template, options);
    } catch (e) {
      notify.fromError(
        e,
        `No se pudo generar el ${format === 'xlsx' ? 'Excel' : 'PDF'}.`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="border-b px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Descargar presupuesto
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          El Excel y el PDF llevan lo mismo; elige el que te convenga para
          entregar.
        </p>
      </div>
      <ul className="divide-y">
        {templates.map((t) => (
          <li
            key={t}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-[200px] flex-1 space-y-0.5">
              <p className="text-sm font-medium">{BUDGET_TEMPLATE_LABEL[t]}</p>
              <p className="text-xs text-muted-foreground">
                {TEMPLATE_HINT[t]}
                {t === 'patient'
                  ? includeBs
                    ? ' Montos en bolívares, con el total en $ y la tasa BCV.'
                    : ' Montos en dólares.'
                  : ''}
              </p>
              {t === 'patient' ? (
                <div className="flex items-center gap-2 pt-1.5">
                  <Checkbox
                    id="budget-include-bs"
                    checked={includeBs}
                    onCheckedChange={(v) => setIncludeBs(v === true)}
                    disabled={busy !== null}
                  />
                  <Label
                    htmlFor="budget-include-bs"
                    className="cursor-pointer text-xs font-normal text-muted-foreground"
                  >
                    Incluir montos en bolívares (tasa BCV)
                  </Label>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(['xlsx', 'pdf'] as Format[]).map((f) => (
                <FormatButton
                  key={f}
                  format={f}
                  busy={busy === `${t}:${f}`}
                  disabled={busy !== null}
                  onClick={() => void run(t, f)}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
