import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-section';
import { FormSwitch } from '@/components/ui/form-switch';
import { Badge } from '@/components/ui/badge';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { orderGateway } from '../../../infrastructure/orderGateway';
import type { Order } from '../../../domain/models/order';
import {
  downloadOrdenInternaForProvider,
  groupOrderProviders,
  type OrderProviderGroup,
} from '../orderExcel';
import { downloadOrdenInternaPdfForProvider } from '../orderPdf';

/**
 * Paso 2 — Atención del paciente.
 *
 * Permite descargar la **orden interna por cada tipo de servicio** registrado
 * (un archivo XLSX o PDF por proveedor) e imprimirla. Cada orden interna queda
 * marcada como "Descargada" en cuanto se baja uno de los dos formatos
 * (Excel **o** PDF, basta con uno). Una vez todas descargadas, se habilita la
 * confirmación que avanza al Paso 3.
 *
 * La factura completa (con todos los STs en un solo archivo) NO va aquí —
 * se descarga en el Paso 4 (Facturación y liquidación).
 */
export function OrderAttendStep({
  order,
  onSaved,
  onAdvance,
}: {
  order: Order;
  onSaved: () => void;
  onAdvance?: () => void;
}) {
  const providerGroups = useMemo(() => groupOrderProviders(order), [order]);

  const [attended, setAttended] = useState(!!order.attended);
  // Estado FE-only: claves de proveedor con al menos un formato descargado.
  // Si la orden ya está atendida, asumimos todas descargadas (paso ya superado).
  const [downloadedKeys, setDownloadedKeys] = useState<Set<string>>(() =>
    order.attended ? new Set(providerGroups.map((g) => g.key)) : new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const allDownloaded = providerGroups.every((g) => downloadedKeys.has(g.key));

  const onSubmit = async () => {
    setSaving(true);
    try {
      await orderGateway.attend(order.id, { attended });
      notify.success('Atención registrada');
      onSaved();
      if (attended) onAdvance?.();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo registrar la atención'));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadProvider = async (
    group: OrderProviderGroup,
    fmt: 'xlsx' | 'pdf',
  ) => {
    setDownloadingId(`${group.key}:${fmt}`);
    try {
      if (fmt === 'xlsx') {
        await downloadOrdenInternaForProvider(order, group);
      } else {
        await downloadOrdenInternaPdfForProvider(order, group);
      }
      setDownloadedKeys((prev) => {
        if (prev.has(group.key)) return prev;
        const next = new Set(prev);
        next.add(group.key);
        return next;
      });
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo generar la orden interna'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <FormSection
        title="Órdenes internas"
        description="Un archivo por cada proveedor distinto de la orden, agrupando sus Tipos de Servicio. Descargá Excel o PDF (basta uno) e imprimilo. La factura completa se descarga en el Paso 4."
      >
        {providerGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            La orden no tiene proveedores asignados.
          </p>
        ) : (
          <ul className="space-y-2">
            {providerGroups.map((g) => {
              const isDownloaded = downloadedKeys.has(g.key);
              return (
                <li
                  key={g.key}
                  className="rounded-lg border bg-card p-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-md bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      <span className="truncate">{g.providerName}</span>
                      <span className="text-xs text-muted-foreground font-normal shrink-0">
                        ({g.providerType === 'doctor' ? 'Doctor' : 'Centro'})
                      </span>
                      {isDownloaded ? (
                        <Badge
                          variant="default"
                          className="bg-success text-white gap-1 shrink-0"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Descargada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground shrink-0">
                          Pendiente
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {g.rows.length} servicio{g.rows.length === 1 ? '' : 's'} ·{' '}
                      {g.rows
                        .map((r) => r.serviceType?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadProvider(g, 'xlsx')}
                      disabled={downloadingId !== null}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {downloadingId === `${g.key}:xlsx` ? 'Generando…' : 'Excel'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadProvider(g, 'pdf')}
                      disabled={downloadingId !== null}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {downloadingId === `${g.key}:pdf` ? 'Generando…' : 'PDF'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Confirmar órdenes internas"
        description="Confirmá que descargaste e imprimiste las órdenes internas de todos los proveedores para avanzar al informe."
      >
        <FormSwitch
          label="Órdenes internas descargadas e impresas"
          description="Marcá cuando hayas descargado (Excel o PDF) e impreso la orden interna de cada proveedor."
          checked={attended}
          onCheckedChange={setAttended}
          disabled={!allDownloaded}
        />
        {!allDownloaded ? (
          <p className="text-xs text-warning mt-2">
            Descargá al menos un archivo (Excel o PDF) de cada proveedor para
            habilitar la confirmación.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 mt-4 flex-wrap">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={saving || !attended || !allDownloaded}
          >
            {saving
              ? 'Guardando...'
              : onAdvance
                ? 'Confirmar y continuar al informe'
                : 'Confirmar'}
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
