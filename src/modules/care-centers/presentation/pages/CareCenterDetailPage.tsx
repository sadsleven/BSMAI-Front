import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { careCenterGateway } from '../../infrastructure/careCenterGateway';
import { CareCenterDetailBody } from '../components/CareCenterDetail';
import type { CareCenter } from '../../domain/models/careCenter';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Bank } from '@/modules/banks/domain/models/bank';

export function CareCenterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [center, setCenter] = useState<CareCenter | null>(null);
  const [banks, setBanks] = useState<Map<string, Bank>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([careCenterGateway.getById(id), bankGateway.list()])
      .then(([c, bs]) => {
        if (cancelled) return;
        setCenter(c);
        const map = new Map<string, Bank>();
        for (const b of bs) map.set(b.code, b);
        setBanks(map);
      })
      .catch((e) => {
        if (cancelled) return;
        notify.fromError(e, 'No se pudo cargar el centro.');
        navigate('/care-centers');
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
            to="/care-centers"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a centros de atención
          </Link>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {center ? center.businessName : 'Detalle del centro'}
          </h1>
        </div>
        {center ? (
          <Can permission={PERMISSIONS.CARE_CENTERS.UPDATE}>
            <Link to={`/care-centers/edit/${center.id}`}>
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
        ) : center ? (
          <CareCenterDetailBody center={center} banks={banks} />
        ) : null}
      </div>
    </div>
  );
}
