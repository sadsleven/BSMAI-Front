import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { insuranceGateway } from '../../infrastructure/insuranceGateway';
import { InsuranceDetailBody } from '../components/InsuranceDetail';
import type { Insurance } from '../../domain/models/insurance';

export function InsuranceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [insurance, setInsurance] = useState<Insurance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    insuranceGateway
      .getById(id)
      .then((i) => {
        if (!cancelled) setInsurance(i);
      })
      .catch((e) => {
        if (cancelled) return;
        notify.fromError(e, 'No se pudo cargar el seguro.');
        navigate('/insurances');
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
            to="/insurances"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a seguros
          </Link>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {insurance ? insurance.name : 'Detalle del seguro'}
          </h1>
        </div>
        {insurance ? (
          <Can permission={PERMISSIONS.INSURANCES.UPDATE}>
            <Link to={`/insurances/edit/${insurance.id}`}>
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
        ) : insurance ? (
          <InsuranceDetailBody insurance={insurance} />
        ) : null}
      </div>
    </div>
  );
}
