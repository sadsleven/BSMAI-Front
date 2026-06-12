import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Stethoscope, Hospital } from 'lucide-react';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { FileDropzone } from '@/modules/files/presentation/components/FileDropzone';
import {
  ORDER_REPORT_KIND,
  orderReportProviderKind,
} from '@/modules/files/domain/models/file';
import { orderGateway } from '../../../infrastructure/orderGateway';
import {
  holderDisplayName,
  type Order,
  type ProviderType,
  type ReportProviderInput,
} from '../../../domain/models/order';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

type ProviderSegment = {
  key: string;
  type: ProviderType;
  id: string;
  label: string;
};

/** Observaciones por proveedor (keyed `${type}:${id}`) desde la orden. */
function deriveObservations(order: Order): Record<string, string> {
  const m: Record<string, string> = {};
  for (const pr of order.providerReports ?? []) {
    const id = pr.providerType === 'doctor' ? pr.doctorId : pr.careCenterId;
    if (id) m[`${pr.providerType}:${id}`] = pr.observations ?? '';
  }
  return m;
}

/** Proveedores distintos (doctor/centro) presentes en la orden, vía OST. */
function deriveProviders(order: Order): ProviderSegment[] {
  return (order.orderServiceTypes ?? []).reduce<ProviderSegment[]>((acc, row) => {
    const id = row.providerType === 'doctor' ? row.doctorId : row.careCenterId;
    if (!id) return acc;
    const key = `${row.providerType}:${id}`;
    if (acc.some((p) => p.key === key)) return acc;
    const label =
      row.providerType === 'doctor'
        ? holderDisplayName(row.doctor ?? undefined)
        : (row.careCenter?.businessName ?? '—');
    acc.push({ key, type: row.providerType, id, label });
    return acc;
  }, []);
}

/**
 * Paso 3 — Informe médico y estudios, segmentado por proveedor.
 *
 * Cada proveedor (doctor/centro) de la orden tiene su propia sección con
 * observaciones + archivos (`kind` por proveedor). El staff además edita una
 * "nota general" a nivel orden (`otherStudies`). Cuando `scopeProvider` está
 * presente (usuario proveedor), sólo se muestra y edita ese segmento.
 */
export function OrderReportStep({
  order,
  onSaved,
  onAdvance,
  scopeProvider,
}: {
  order: Order;
  onSaved: () => void;
  onAdvance?: () => void;
  /** Restringe la vista al segmento de un proveedor (usuario proveedor). */
  scopeProvider?: { type: ProviderType; id: string };
}) {
  const isProvider = !!scopeProvider;

  const providers = useMemo(() => {
    const all = deriveProviders(order);
    if (!scopeProvider) return all;
    return all.filter(
      (p) => p.type === scopeProvider.type && p.id === scopeProvider.id,
    );
  }, [order, scopeProvider]);

  // Init perezosa desde la orden. El padre remonta con `key={order.id}` al
  // cambiar de orden, por lo que no hace falta un effect de sincronización.
  const [otherStudies, setOtherStudies] = useState(() => order.otherStudies ?? '');
  const [obs, setObs] = useState<Record<string, string>>(() =>
    deriveObservations(order),
  );
  // Conteo de archivos por proveedor (keyed igual que `providers`), alimentado
  // por el `onChange` de cada FileDropzone. Habilita guardar si hay archivo.
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Proveedor: requiere al menos una observación con texto O un archivo subido
  // en alguno de sus segmentos para poder guardar el informe. Staff sin tope.
  const canSubmit = useMemo(() => {
    if (!isProvider) return true;
    return providers.some(
      (p) => (obs[p.key] ?? '').trim() !== '' || (fileCounts[p.key] ?? 0) > 0,
    );
  }, [isProvider, providers, obs, fileCounts]);

  const onSubmit = async () => {
    setSaving(true);
    try {
      // Proveedor: edita sólo su segmento (observaciones + archivos).
      // Staff (no proveedor): edita sólo la nota general; las observaciones por
      // proveedor son de sólo lectura, no se envían para no sobrescribirlas.
      const providerReports: ReportProviderInput[] = providers.map((p) => ({
        providerType: p.type,
        doctorId: p.type === 'doctor' ? p.id : undefined,
        careCenterId: p.type === 'care_center' ? p.id : undefined,
        observations: (obs[p.key] ?? '').trim() === '' ? null : obs[p.key],
      }));
      await orderGateway.report(
        order.id,
        isProvider
          ? { providerReports }
          : { otherStudies: otherStudies.trim() === '' ? null : otherStudies },
      );
      notify.success('Informe guardado');
      onSaved();
      onAdvance?.();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo guardar el informe'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-[15px] font-semibold">Informe médico y estudios</h2>

      {!isProvider ? (
        <div className="space-y-2 rounded-lg border  p-4 bg-card">
          <Label htmlFor="otherStudies">Nota general de la orden</Label>
          <p className="text-xs text-muted-foreground">
            Observaciones a nivel de la orden (opcional). Las observaciones y archivos
            por proveedor van en cada sección de abajo.
          </p>
          <Textarea
            id="otherStudies"
            rows={3}
            maxLength={5000}
            value={otherStudies}
            onChange={(e) => setOtherStudies(e.target.value)}
            placeholder="Notas u observaciones generales de la orden…"
            className="bg-card"
          />
          <div className="pt-1">
            <Label className="text-xs">Archivos generales</Label>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              PDF, imágenes (PNG/JPG/WebP).
            </p>
            <FileDropzone
              ownerType="order"
              ownerId={order.id}
              kind={ORDER_REPORT_KIND}
              accept={ACCEPT}
            />
          </div>
        </div>
      ) : null}

      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {isProvider
            ? 'No tenés servicios asignados en esta orden.'
            : 'La orden no tiene proveedores asignados.'}
        </p>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <div key={p.key} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                {p.type === 'doctor' ? (
                  <Stethoscope className="w-4 h-4 text-brand-blue" />
                ) : (
                  <Hospital className="w-4 h-4 text-brand-blue" />
                )}
                <span className="text-sm font-semibold">{p.label}</span>
                <Badge variant="outline" className="text-[11px]">
                  {p.type === 'doctor' ? 'Doctor' : 'Centro'}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`obs-${p.key}`}>
                  Observaciones
                  {!isProvider ? (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      (sólo lectura)
                    </span>
                  ) : null}
                </Label>
                <Textarea
                  id={`obs-${p.key}`}
                  rows={4}
                  maxLength={5000}
                  value={obs[p.key] ?? ''}
                  onChange={(e) =>
                    setObs((prev) => ({ ...prev, [p.key]: e.target.value }))
                  }
                  readOnly={!isProvider}
                  placeholder={
                    isProvider
                      ? 'Hallazgos, estudios y observaciones del proveedor…'
                      : 'Sin observaciones registradas por el proveedor.'
                  }
                  className={!isProvider ? 'bg-muted/30 cursor-default' : undefined}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Archivos adjuntos</Label>
                {isProvider ? (
                  <p className="text-[11px] text-muted-foreground">
                    PDF, imágenes (PNG/JPG/WebP).
                  </p>
                ) : null}
                <FileDropzone
                  ownerType="order"
                  ownerId={order.id}
                  kind={orderReportProviderKind(p.type, p.id)}
                  accept={ACCEPT}
                  readOnly={!isProvider}
                  onChange={(files) =>
                    setFileCounts((prev) => ({ ...prev, [p.key]: files.length }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-end gap-1.5">
        {isProvider && !canSubmit ? (
          <p className="text-xs text-muted-foreground">
            Ingresá una observación o subí un archivo para guardar.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 flex-wrap">
          <Button type="button" onClick={onSubmit} disabled={saving || !canSubmit}>
            {saving
              ? 'Guardando…'
              : onAdvance
                ? 'Guardar informe y continuar a facturación'
                : 'Guardar informe'}
          </Button>
        </div>
      </div>
    </div>
  );
}
