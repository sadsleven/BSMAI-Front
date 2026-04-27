import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Stethoscope } from 'lucide-react';
import { specialtyGateway } from '../../infrastructure/specialtyGateway';
import type { Specialty } from '../../domain/models/specialty';
import { notify } from '@/lib/notifications/toast';

export type SpecialtyDetailProps = {
  specialtyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SpecialtyDetail({
  specialtyId,
  open,
  onOpenChange,
}: SpecialtyDetailProps) {
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !specialtyId) {
      setSpecialty(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    specialtyGateway
      .getById(specialtyId)
      .then((s) => {
        if (!cancelled) setSpecialty(s);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la especialidad.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specialtyId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Stethoscope}
      title={specialty ? specialty.name : 'Detalle de la especialidad'}
      loading={loading}
    >
      {specialty ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={specialty.name} />
            <DetailRow label="Descripción" value={specialty.description} />
            <DetailRow
              label="Estado"
              value={
                specialty.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : specialty.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>

          {(specialty.createdAt || specialty.updatedAt) && (
            <DetailSection title="Auditoría">
              {specialty.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(specialty.createdAt).toLocaleString()}
                />
              )}
              {specialty.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(specialty.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
