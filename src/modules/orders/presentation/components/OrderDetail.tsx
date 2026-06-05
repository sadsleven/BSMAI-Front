import { useEffect, useState, type ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { formatMoney } from '@/lib/format/money';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  holderDisplayId,
  holderDisplayName,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_TYPE_LABEL,
  type Order,
  type OrderStatus,
} from '../../domain/models/order';

export type OrderDetailProps = {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STATUS_TONE: Record<
  OrderStatus,
  'success' | 'warning' | 'destructive' | 'info'
> = {
  draft: 'info',
  in_progress: 'info',
  attended: 'warning',
  report_issued: 'warning',
  finalized: 'success',
  cancelled: 'destructive',
};

function fmtDate(s?: string | null): string {
  if (!s) return '';
  return new Date(s).toLocaleString('es-VE');
}

function fmtDay(s?: string | null): string {
  if (!s) return '';
  return s.slice(0, 10);
}

/**
 * Cuerpo del detalle de la orden. Reutilizado por el modal `OrderDetail` y la
 * página `OrderDetailPage`. `extraSections` permite injectar contenido extra
 * (ej. lista de archivos del informe en la página completa).
 */
export function OrderDetailBody({
  order,
  extraSections,
}: {
  order: Order;
  extraSections?: ReactNode;
}) {
  const providers = (order.orderServiceTypes ?? []).reduce<
    Array<{ key: string; label: string; type: 'doctor' | 'care_center' }>
  >((acc, row) => {
    const id = row.providerType === 'doctor' ? row.doctorId : row.careCenterId;
    if (!id) return acc;
    const key = `${row.providerType}:${id}`;
    if (acc.some((p) => p.key === key)) return acc;
    const label =
      row.providerType === 'doctor'
        ? holderDisplayName(row.doctor ?? undefined)
        : (row.careCenter?.businessName ?? '—');
    acc.push({ key, label, type: row.providerType });
    return acc;
  }, []);

  return (
    <div className="divide-y">
      <DetailSection title="General">
        <DetailRow label="N° orden" value={order.orderNumber} mono />
        <DetailRow label="Sucursal" value={order.branch?.name} />
        <DetailRow label="Tipo" value={ORDER_TYPE_LABEL[order.type]} />
        <DetailRow
          label="Estado"
          value={
            <DetailBadge tone={STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </DetailBadge>
          }
        />
        <DetailRow label="Fecha de orden" value={fmtDay(order.orderDate)} />
        <DetailRow label="Fecha de atención" value={fmtDate(order.appointmentDate)} />
      </DetailSection>

      <DetailSection title="Titular y paciente">
        <DetailRow
          label="Titular"
          value={
            <>
              {holderDisplayName(order.holder)}
              {holderDisplayId(order.holder) && (
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  {holderDisplayId(order.holder)}
                </span>
              )}
            </>
          }
        />
        {order.patientId !== order.holderId && (
          <DetailRow
            label="Paciente"
            value={
              <>
                {holderDisplayName(order.patient)}
                {holderDisplayId(order.patient) && (
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    {holderDisplayId(order.patient)}
                  </span>
                )}
              </>
            }
          />
        )}
        {order.contractor?.name && (
          <DetailRow label="Contratista" value={order.contractor.name} />
        )}
        {order.insurance?.name && (
          <DetailRow
            label="Seguro"
            value={
              <>
                {order.insurance.name}
                {order.insuranceSource === 'direct' && (
                  <span className="ml-2 text-xs text-muted-foreground">(directo)</span>
                )}
                {order.insuranceSource === 'via_contractor' && (
                  <span className="ml-2 text-xs text-muted-foreground">(vía contratista)</span>
                )}
              </>
            }
          />
        )}
        {order.serviceKey ? (
          <DetailRow label="Clave de servicio" value={order.serviceKey} />
        ) : null}
      </DetailSection>

      <DetailSection title="Proveedores y servicios">
        <DetailRow
          label={`Proveedor${providers.length === 1 ? '' : 'es'}`}
          value={
            providers.length === 0 ? (
              '—'
            ) : (
              <ul className="space-y-0.5">
                {providers.map((p) => (
                  <li key={p.key}>
                    {p.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({p.type === 'doctor' ? 'Doctor' : 'Centro'})
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
        <DetailRow label="Especialidad" value={order.specialty?.name} />
        <DetailRow
          label="Tipos de servicio"
          value={
            order.orderServiceTypes && order.orderServiceTypes.length > 0 ? (
              <ul className="space-y-0.5">
                {order.orderServiceTypes.map((row) => (
                  <li key={row.serviceTypeId}>
                    {row.serviceType?.name ?? row.serviceTypeId}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.providerType === 'doctor'
                        ? holderDisplayName(row.doctor ?? undefined)
                        : (row.careCenter?.businessName ?? '—')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
        <DetailRow
          label="Patologías"
          value={
            order.pathologies && order.pathologies.length > 0
              ? order.pathologies.map((p) => p.name).join(', ')
              : null
          }
        />
      </DetailSection>

      <DetailSection title="Monto">
        <DetailRow label="Precio" value={`${formatMoney(order.priceAmount)} USD`} mono />
        {order?.doctorAmount != null && (
          <DetailRow
            label="Monto al proveedor"
            value={`${formatMoney(order?.doctorAmount)} USD`}
            mono
          />
        )}
        {order.billingExchangeRate && (
          <DetailRow
            label="Tasa facturación"
            value={`1 ${order.billingExchangeRate.currency} = ${formatMoney(order.billingExchangeRate.amountBs)} Bs.`}
            mono
          />
        )}
      </DetailSection>

      {(order.attended != null || order.attendedAt) && (
        <DetailSection title="Atención">
          <DetailRow
            label="Atendido"
            value={
              order.attended ? (
                <DetailBadge tone="success">Sí</DetailBadge>
              ) : (
                <DetailBadge tone="warning">No</DetailBadge>
              )
            }
          />
          <DetailRow label="Fecha y hora" value={fmtDate(order.attendedAt)} />
        </DetailSection>
      )}

      {order.otherStudies && (
        <DetailSection title="Informe">
          <p className="text-sm whitespace-pre-wrap">{order.otherStudies}</p>
        </DetailSection>
      )}

      {extraSections}

      {order.payments && order.payments.length > 0 && (
        <DetailSection title={`Pagos de la orden (${order.payments.length})`}>
          <ul className="space-y-2">
            {order.payments.map((p) => (
              <li
                key={p.id ?? `${p.paymentDate}-${p.amountValue}`}
                className="rounded-lg border bg-card p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {PAYMENT_TYPE_LABEL[p.type]} ·{' '}
                    {p.paymentDate
                      ? new Date(p.paymentDate).toLocaleDateString('es-VE')
                      : '—'}
                  </div>
                  {(p.bankCode || p.referenceNumber) && (
                    <div className="text-xs text-muted-foreground truncate">
                      {p.bankCode ? `Banco ${p.bankCode}` : ''}
                      {p.bankCode && p.referenceNumber ? ' · ' : ''}
                      {p.referenceNumber ? `Ref. ${p.referenceNumber}` : ''}
                    </div>
                  )}
                </div>
                <div className="text-sm font-mono text-right">
                  {formatMoney(p.amountValue)} {p.amountCurrency}
                </div>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {(order.createdAt || order.updatedAt) && (
        <DetailSection title="Auditoría">
          {order.createdAt && (
            <DetailRow label="Creada" value={fmtDate(order.createdAt)} />
          )}
          {order.updatedAt && (
            <DetailRow label="Actualizada" value={fmtDate(order.updatedAt)} />
          )}
          {order.deletedAt && (
            <DetailRow
              label="Eliminada"
              value={
                <DetailBadge tone="destructive">{fmtDate(order.deletedAt)}</DetailBadge>
              }
            />
          )}
        </DetailSection>
      )}
    </div>
  );
}

export function OrderDetail({ orderId, open, onOpenChange }: OrderDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    orderGateway
      .getById(orderId)
      .then((o) => !cancelled && setOrder(o))
      .catch((e) => !cancelled && notify.fromError(e, 'No se pudo cargar la orden.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orderId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={ClipboardList}
      title={order ? `Orden N° ${order.orderNumber}` : 'Detalle de orden'}
      loading={loading}
    >
      {order ? <OrderDetailBody order={order} /> : null}
    </DetailDialog>
  );
}
