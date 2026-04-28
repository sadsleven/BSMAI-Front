import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Briefcase } from 'lucide-react';
import { contractorGateway } from '../../infrastructure/contractorGateway';
import type { Contractor } from '../../domain/models/contractor';
import { notify } from '@/lib/notifications/toast';

export type ContractorDetailProps = {
  contractorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ContractorDetail({ contractorId, open, onOpenChange }: ContractorDetailProps) {
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !contractorId) {
      setContractor(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    contractorGateway
      .getById(contractorId)
      .then((p) => {
        if (!cancelled) setContractor(p);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el contratista.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Briefcase}
      title={contractor ? contractor.name : 'Detalle del contratista'}
      loading={loading}
    >
      {contractor ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={contractor.name} />
            <DetailRow label="Descripción" value={contractor.description} />
            <DetailRow
              label="Estado"
              value={
                contractor.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : contractor.isActive ? (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                )
              }
            />
          </DetailSection>
          {(contractor.createdAt || contractor.updatedAt) && (
            <DetailSection title="Auditoría">
              {contractor.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(contractor.createdAt).toLocaleString()}
                />
              )}
              {contractor.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(contractor.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
