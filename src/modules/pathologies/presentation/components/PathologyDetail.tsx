import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Activity } from 'lucide-react';
import { pathologyGateway } from '../../infrastructure/pathologyGateway';
import type { Pathology } from '../../domain/models/pathology';
import { notify } from '@/lib/notifications/toast';

export type PathologyDetailProps = {
  pathologyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PathologyDetail({ pathologyId, open, onOpenChange }: PathologyDetailProps) {
  const [pathology, setPathology] = useState<Pathology | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !pathologyId) {
      setPathology(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pathologyGateway
      .getById(pathologyId)
      .then((p) => {
        if (!cancelled) setPathology(p);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la patología.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathologyId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Activity}
      title={pathology ? pathology.name : 'Detalle de la patología'}
      loading={loading}
    >
      {pathology ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={pathology.name} />
            <DetailRow label="Descripción" value={pathology.description} />
            <DetailRow
              label="Estado"
              value={
                pathology.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : pathology.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>
          {(pathology.createdAt || pathology.updatedAt) && (
            <DetailSection title="Auditoría">
              {pathology.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(pathology.createdAt).toLocaleString()}
                />
              )}
              {pathology.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(pathology.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
