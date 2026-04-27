import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { UserRound } from 'lucide-react';
import { patientGateway } from '../../infrastructure/patientGateway';
import { fullName, type Patient } from '../../domain/models/patient';
import { notify } from '@/lib/notifications/toast';

export type PatientDetailProps = {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PatientDetail({ patientId, open, onOpenChange }: PatientDetailProps) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !patientId) {
      setPatient(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    patientGateway
      .getById(patientId)
      .then((p) => {
        if (!cancelled) setPatient(p);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el paciente.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={UserRound}
      title={patient ? fullName(patient) : 'Detalle del paciente'}
      subtitle={patient?.email}
      loading={loading}
    >
      {patient ? (
        <div className="divide-y">
          <DetailSection title="Información personal">
            <DetailRow label="Cédula" value={patient.cedula} mono />
            <DetailRow label="Email" value={patient.email} />
            <DetailRow
              label="Nacimiento"
              value={
                patient.birthDate
                  ? new Date(patient.birthDate).toLocaleDateString()
                  : null
              }
            />
            <DetailRow label="Dirección" value={patient.address} />
            <DetailRow
              label="Estado"
              value={
                patient.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : patient.isActive ? (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                )
              }
            />
          </DetailSection>

          <DetailSection title={`Teléfonos (${patient.phones?.length ?? 0})`}>
            {patient.phones?.length ? (
              <ul className="space-y-1.5">
                {patient.phones.map((p) => (
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

          {(patient.createdAt || patient.updatedAt) && (
            <DetailSection title="Auditoría">
              {patient.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(patient.createdAt).toLocaleString()}
                />
              )}
              {patient.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(patient.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
