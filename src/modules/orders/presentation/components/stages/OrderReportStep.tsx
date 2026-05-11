import { useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { orderGateway } from '../../../infrastructure/orderGateway';
import type { Order } from '../../../domain/models/order';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/**
 * Paso 3 — Informe médico y estudios.
 *
 * Dropzone multi-file FE-only en MVP (estado local). El upload al BE se define
 * cuando se decida la estrategia de storage.
 */
export function OrderReportStep({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const [otherStudies, setOtherStudies] = useState(order.otherStudies ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const onFilesChange = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };
  const onRemove = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const onSubmit = async () => {
    setSaving(true);
    try {
      await orderGateway.report(order.id, {
        otherStudies: otherStudies.trim() === '' ? null : otherStudies,
      });
      notify.success('Informe emitido');
      onSaved();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo emitir el informe'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-[15px] font-semibold">Informe médico y estudios</h2>

      <div className="space-y-2">
        <Label>Archivos adjuntos</Label>
        <p className="text-xs text-muted-foreground">
          PDF, imágenes (PNG/JPG/WebP). Por ahora se almacenan sólo en el
          navegador hasta definir el storage en backend.
        </p>
        <label
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:bg-muted/40 transition-colors"
          htmlFor="report-files"
        >
          <Upload className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm">Arrastrá o hacé click para subir</span>
          <input
            id="report-files"
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => onFilesChange(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1.5 mt-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 text-sm rounded-md border bg-muted/40 px-3 py-2"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="p-1 rounded hover:bg-destructive-soft hover:text-destructive transition-colors"
                  aria-label="Quitar archivo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="otherStudies">Otros estudios</Label>
        <Textarea
          id="otherStudies"
          rows={4}
          maxLength={5000}
          value={otherStudies}
          onChange={(e) => setOtherStudies(e.target.value)}
          placeholder="Notas, observaciones o estudios adicionales..."
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onSubmit} disabled={saving}>
          {saving ? 'Guardando...' : 'Emitir informe'}
        </Button>
      </div>
    </div>
  );
}
