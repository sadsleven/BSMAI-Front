import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notifications/toast';
import { cn } from '@/lib/utils';

/**
 * Botón "Descargar Excel" compartido por los reportes. Maneja su propio estado
 * de carga y notifica errores. Se coloca en el slot `actions` del
 * `DataTableToolbar`, alineado con la fila de filtros encima de la tabla.
 *
 * `variant="outline"` para descargas secundarias (p. ej. estados de cuenta),
 * así solo el Excel principal usa el verde de Excel.
 */
export function ReportDownloadButton({
  onDownload,
  disabled,
  label = 'Descargar Excel',
  variant = 'excel',
}: {
  onDownload: () => Promise<void>;
  disabled?: boolean;
  label?: string;
  variant?: 'excel' | 'outline';
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onDownload();
    } catch (e) {
      notify.fromError(e, 'No se pudo generar el Excel');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={run}
      disabled={disabled || busy}
      variant={variant === 'outline' ? 'outline' : 'default'}
      size="default"
      className={cn(
        'h-9 px-3',
        variant === 'excel' &&
          'bg-[#107C41] text-white hover:bg-[#0e6a38] focus-visible:ring-[#107C41]/40',
      )}
    >
      <FileSpreadsheet className="size-4" />
      {busy ? 'Generando…' : label}
    </Button>
  );
}
