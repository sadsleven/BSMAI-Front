import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { doctorGateway } from '../../infrastructure/doctorGateway';
import { DoctorDetailBody } from '../components/DoctorDetail';
import { fullName, type Doctor } from '../../domain/models/doctor';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Bank } from '@/modules/banks/domain/models/bank';

export function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [banks, setBanks] = useState<Map<string, Bank>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([doctorGateway.getById(id), bankGateway.list()])
      .then(([d, bs]) => {
        if (cancelled) return;
        setDoctor(d);
        const map = new Map<string, Bank>();
        for (const b of bs) map.set(b.code, b);
        setBanks(map);
      })
      .catch((e) => {
        if (cancelled) return;
        notify.fromError(e, 'No se pudo cargar el doctor.');
        navigate('/doctors');
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
            to="/doctors"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a doctores
          </Link>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {doctor ? fullName(doctor) : 'Detalle del doctor'}
          </h1>
        </div>
        {doctor ? (
          <Can permission={PERMISSIONS.DOCTORS.UPDATE}>
            <Link to={`/doctors/edit/${doctor.id}`}>
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
        ) : doctor ? (
          <DoctorDetailBody doctor={doctor} banks={banks} />
        ) : null}
      </div>
    </div>
  );
}
