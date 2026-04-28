import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Building } from 'lucide-react';
import { branchGateway } from '../../infrastructure/branchGateway';
import type { Branch } from '../../domain/models/branch';
import { notify } from '@/lib/notifications/toast';

export type BranchDetailProps = {
  branchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BranchDetail({ branchId, open, onOpenChange }: BranchDetailProps) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !branchId) {
      setBranch(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    branchGateway
      .getById(branchId)
      .then((b) => {
        if (!cancelled) setBranch(b);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la sucursal.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Building}
      title={branch ? branch.name : 'Detalle de la sucursal'}
      loading={loading}
    >
      {branch ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={branch.name} />
            <DetailRow label="Descripción" value={branch.description} />
            <DetailRow
              label="Estado"
              value={
                branch.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : branch.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>
          {(branch.createdAt || branch.updatedAt) && (
            <DetailSection title="Auditoría">
              {branch.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(branch.createdAt).toLocaleString()}
                />
              )}
              {branch.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(branch.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
