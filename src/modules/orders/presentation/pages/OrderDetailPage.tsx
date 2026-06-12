import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { DetailSection } from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { orderGateway } from '../../infrastructure/orderGateway';
import { OrderDetailBody } from '../components/OrderDetail';
import type { Order } from '../../domain/models/order';
import { FileListReadonly } from '@/modules/files/presentation/components/FileListReadonly';
import { ORDER_REPORT_KIND } from '@/modules/files/domain/models/file';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    orderGateway
      .getById(id)
      .then((o) => !cancelled && setOrder(o))
      .catch((e) => {
        if (cancelled) return;
        notify.fromError(e, 'No se pudo cargar la orden.');
        navigate('/orders');
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
            to="/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a órdenes
          </Link>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            {order ? `Orden N° ${order.orderNumber}` : 'Detalle de orden'}
          </h1>
        </div>
        {order ? (
          <Can permission={PERMISSIONS.ORDERS.UPDATE}>
            <Link to={`/orders/edit/${order.id}`}>
              <Button variant="outline">
                <ListChecks className="w-4 h-4 mr-1.5" />
                Continuar flujo
              </Button>
            </Link>
          </Can>
        ) : null}
      </div>

      <div className="bg-card rounded-xl border shadow-xs px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
        ) : order ? (
          <OrderDetailBody
            order={order}
            extraSections={
              <DetailSection title="Archivos del informe">
                <FileListReadonly
                  ownerType="order"
                  ownerId={order.id}
                  kind={ORDER_REPORT_KIND}
                  emptyLabel="Aún no se subieron archivos para esta orden."
                />
              </DetailSection>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
