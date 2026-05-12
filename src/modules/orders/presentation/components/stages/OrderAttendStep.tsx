import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-section';
import { FormSwitch } from '@/components/ui/form-switch';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { orderGateway } from '../../../infrastructure/orderGateway';
import type { Order } from '../../../domain/models/order';
import { downloadOrdenInternaForServiceType } from '../orderExcel';

/**
 * Paso 2 — Atención del paciente.
 *
 * Permite descargar la **orden interna por cada tipo de servicio** registrado
 * (un archivo XLSX por ST) + marcar atendido + fecha/hora de atención.
 *
 * La factura completa (con todos los STs en un solo archivo) NO va aquí —
 * se descarga en el Paso 4 (Facturación y liquidación).
 */
export function OrderAttendStep({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const [attended, setAttended] = useState(!!order.attended);
  const [attendedAt, setAttendedAt] = useState<string>(order.attendedAt ?? '');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const onSubmit = async () => {
    setSaving(true);
    try {
      await orderGateway.attend(order.id, {
        attended,
        attendedAt: attended && attendedAt ? new Date(attendedAt).toISOString() : undefined,
      });
      notify.success('Atención registrada');
      onSaved();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo registrar la atención'));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadST = async (st: { id: string; name: string }) => {
    setDownloadingId(st.id);
    try {
      await downloadOrdenInternaForServiceType(order, st);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo generar la orden interna'));
    } finally {
      setDownloadingId(null);
    }
  };

  const serviceTypes = order.serviceTypes ?? [];

  return (
    <div className="space-y-5">
      <FormSection
        title="Órdenes internas"
        description="Un archivo XLSX por cada tipo de servicio registrado en la orden. La factura completa se descarga en el Paso 4."
      >
        {serviceTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            La orden no tiene tipos de servicio asignados.
          </p>
        ) : (
          <ul className="space-y-2">
            {serviceTypes.map((st) => (
              <li
                key={st.id}
                className="rounded-lg border bg-card p-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-md bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{st.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Orden interna · {order.orderNumber}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadST(st)}
                  disabled={downloadingId !== null}
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingId === st.id ? 'Generando…' : 'Descargar XLSX'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Marcar atención"
        description="Registrá si el paciente fue atendido y la fecha/hora correspondiente."
      >
        <FormSwitch
          label="Atendido"
          description="Marcá cuando el paciente haya sido atendido."
          checked={attended}
          onCheckedChange={setAttended}
        />
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-[18px] mt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendedAt">Fecha y hora de atención</Label>
            <DateTimePicker
              id="attendedAt"
              value={attendedAt || undefined}
              onChange={(v) => setAttendedAt(v ?? '')}
              disabled={!attended}
              disableFuture
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button type="button" onClick={onSubmit} disabled={saving}>
            {saving ? 'Guardando...' : 'Marcar atendido'}
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
