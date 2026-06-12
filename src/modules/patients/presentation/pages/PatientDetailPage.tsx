import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { patientGateway } from '../../infrastructure/patientGateway';
import { PatientDetailBody } from '../components/PatientDetail';
import { displayName, type Patient } from '../../domain/models/patient';

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    patientGateway
      .getById(id)
      .then((p) => !cancelled && setPatient(p))
      .catch((e) => {
        if (cancelled) return;
        notify.fromError(e, 'No se pudo cargar el paciente.');
        navigate('/patients');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Link
            to="/patients"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a pacientes
          </Link>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {patient ? displayName(patient) : 'Detalle del paciente'}
          </h1>
        </div>
        {patient ? (
          <Can permission={PERMISSIONS.PATIENTS.UPDATE}>
            <Link to={`/patients/edit/${patient.id}`}>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-1.5" />
                Editar
              </Button>
            </Link>
          </Can>
        ) : null}
      </div>

      <div className="bg-card rounded-xl border shadow-xs px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
        ) : patient ? (
          <PatientDetailBody patient={patient} />
        ) : null}
      </div>
    </div>
  );
}
