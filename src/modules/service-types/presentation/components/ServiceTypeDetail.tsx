import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { FileText } from 'lucide-react';
import { serviceTypeGateway } from '../../infrastructure/serviceTypeGateway';
import type { ServiceType } from '../../domain/models/serviceType';
import { notify } from '@/lib/notifications/toast';
import { formatMoney } from '@/lib/format/money';

export type ServiceTypeDetailProps = {
  serviceTypeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Sección de asignaciones de precio (Seguros / Doctores / Centros). */
function PriceAssignmentSection({
  title,
  items,
}: {
  title: string;
  items: { id: string; name: string; priceUsd: string | number }[];
}) {
  return (
    <DetailSection title={items.length ? `${title} (${items.length})` : title}>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin asignaciones</p>
      ) : (
        items.map((it) => (
          <DetailRow key={it.id} label={it.name} value={`$ ${formatMoney(it.priceUsd)}`} />
        ))
      )}
    </DetailSection>
  );
}

export function ServiceTypeDetail({ serviceTypeId, open, onOpenChange }: ServiceTypeDetailProps) {
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !serviceTypeId) {
      setServiceType(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    serviceTypeGateway
      .getById(serviceTypeId)
      .then((p) => {
        if (!cancelled) setServiceType(p);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el tipo de servicio.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceTypeId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={FileText}
      title={serviceType ? serviceType.name : 'Detalle de el tipo de servicio'}
      loading={loading}
    >
      {serviceType ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={serviceType.name} />
            <DetailRow label="Descripción" value={serviceType.description} />
            <DetailRow
              label="Estado"
              value={
                serviceType.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : serviceType.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>
          <DetailSection title="Precio Particular">
            <DetailRow
              label="USD"
              value={
                serviceType.particularPriceUsd != null
                  ? `$ ${formatMoney(serviceType.particularPriceUsd)}`
                  : '—'
              }
            />
          </DetailSection>
          <PriceAssignmentSection
            title="Seguros"
            items={(serviceType.insurancePrices ?? []).map((p) => ({
              id: p.insuranceId,
              name: p.insuranceName,
              priceUsd: p.priceUsd,
            }))}
          />
          <PriceAssignmentSection
            title="Doctores"
            items={(serviceType.doctorPrices ?? []).map((p) => ({
              id: p.doctorId,
              name: p.doctorName,
              priceUsd: p.priceUsd,
            }))}
          />
          <PriceAssignmentSection
            title="Centros de atención"
            items={(serviceType.careCenterPrices ?? []).map((p) => ({
              id: p.careCenterId,
              name: p.careCenterName,
              priceUsd: p.priceUsd,
            }))}
          />
          {(serviceType.createdAt || serviceType.updatedAt) && (
            <DetailSection title="Auditoría">
              {serviceType.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(serviceType.createdAt).toLocaleString()}
                />
              )}
              {serviceType.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(serviceType.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
