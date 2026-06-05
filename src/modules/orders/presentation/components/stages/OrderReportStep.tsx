import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { FileDropzone } from '@/modules/files/presentation/components/FileDropzone';
import { ORDER_REPORT_KIND } from '@/modules/files/domain/models/file';
import { orderGateway } from '../../../infrastructure/orderGateway';
import type { Order } from '../../../domain/models/order';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/**
 * Paso 3 — Informe médico y estudios.
 *
 * Archivos suben direct cliente → Vercel Blob vía `<FileDropzone>` (módulo
 * `files`). `otherStudies` se persiste con `PATCH /orders/:id/report` al
 * emitir el informe.
 */
export function OrderReportStep({
  order,
  onSaved,
  onAdvance,
}: {
  order: Order;
  onSaved: () => void;
  onAdvance?: () => void;
}) {
  const [otherStudies, setOtherStudies] = useState(order.otherStudies ?? '');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    setSaving(true);
    try {
      await orderGateway.report(order.id, {
        otherStudies: otherStudies.trim() === '' ? null : otherStudies,
      });
      notify.success('Informe emitido');
      onSaved();
      onAdvance?.();
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
          PDF, imágenes (PNG/JPG/WebP). Los archivos se almacenan en Vercel Blob.
        </p>
        <FileDropzone
          ownerType="order"
          ownerId={order.id}
          kind={ORDER_REPORT_KIND}
          accept={ACCEPT}
        />
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

      <div className="flex justify-end gap-2 flex-wrap">
        <Button type="button" onClick={onSubmit} disabled={saving}>
          {saving
            ? 'Guardando...'
            : onAdvance
              ? 'Emitir informe y continuar a facturación'
              : 'Emitir informe'}
        </Button>
      </div>
    </div>
  );
}
