import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Shield } from 'lucide-react';
import { insuranceGateway } from '../../infrastructure/insuranceGateway';
import type { Insurance } from '../../domain/models/insurance';
import { notify } from '@/lib/notifications/toast';

export type InsuranceDetailProps = {
  insuranceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InsuranceDetail({ insuranceId, open, onOpenChange }: InsuranceDetailProps) {
  const [insurance, setInsurance] = useState<Insurance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !insuranceId) {
      setInsurance(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    insuranceGateway
      .getById(insuranceId)
      .then((i) => {
        if (!cancelled) setInsurance(i);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el seguro.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [insuranceId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Shield}
      title={insurance ? insurance.name : 'Detalle del seguro'}
      loading={loading}
    >
      {insurance ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={insurance.name} />
            <DetailRow label="Descripción" value={insurance.description} />
            <DetailRow
              label="Estado"
              value={
                insurance.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : insurance.isActive ? (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                )
              }
            />
          </DetailSection>

          <DetailSection title={`Teléfonos (${insurance.phones?.length ?? 0})`}>
            {insurance.phones?.length ? (
              <ul className="space-y-1.5">
                {insurance.phones.map((p) => (
                  <li
                    key={p.id ?? p.number}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-mono">{p.number}</span>
                    {p.label && (
                      <span className="text-xs text-muted-foreground">{p.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin teléfonos.</p>
            )}
          </DetailSection>

          {(insurance.createdAt || insurance.updatedAt) && (
            <DetailSection title="Auditoría">
              {insurance.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(insurance.createdAt).toLocaleString()}
                />
              )}
              {insurance.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(insurance.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
