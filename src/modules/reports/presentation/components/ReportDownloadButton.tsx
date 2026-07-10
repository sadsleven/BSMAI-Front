import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notifications/toast';

/**
 * Botón "Descargar Excel" compartido por los reportes. Maneja su propio estado
 * de carga y notifica errores. Se coloca en el `headerRight` de `ReportShell`.
 */
export function ReportDownloadButton({
  onDownload,
  disabled,
  label = 'Descargar Excel',
}: {
  onDownload: () => Promise<void>;
  disabled?: boolean;
  label?: string;
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
      className="bg-[#107C41] text-white hover:bg-[#0e6a38] focus-visible:ring-[#107C41]/40"
    >
      <FileSpreadsheet className="size-4" />
      {busy ? 'Generando…' : label}
    </Button>
  );
}
