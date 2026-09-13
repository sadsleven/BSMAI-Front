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
import { formatDateOnly } from '@/lib/dates';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  activeInvoice,
  holderDisplayId,
  holderDisplayName,
  orderServiceKeyDisplay,
  orderUserDisplayName,
  otherCoveredOrders,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_TYPE_LABEL,
  type Order,
  type OrderStatus,
} from '../../domain/models/order';
import { OrderChangeHistory } from './OrderChangeHistory';

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

  // Especialidades presentes en la orden (una por fila ST, sin repetir). En
  // órdenes previas a la especialidad por fila cae a la principal de la orden.
  const orderSpecialtyNames = Array.from(
    new Set(
      (order.orderServiceTypes ?? [])
        .map((row) => row.specialty?.name ?? order.specialty?.name ?? '')
        .filter(Boolean),
    ),
  );

  // Factura AGRUPADA: otras órdenes que salen en la misma factura vigente.
  const currentInvoice = activeInvoice(order);
  const groupedInvoiceOrders = currentInvoice
    ? otherCoveredOrders(currentInvoice, order.id)
    : [];

  // Ajuste de monto del Paso 1: priceAmount − priceBaseAmount (null si no hay
  // base snapshot o si el monto coincide con el catálogo).
  const priceAdjustmentUsd = (() => {
    if (order.priceBaseAmount == null) return null;
    const diffCents =
      Math.round(Number(order.priceAmount) * 100) -
      Math.round(Number(order.priceBaseAmount) * 100);
    return diffCents === 0 ? null : diffCents / 100;
  })();

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
        {orderServiceKeyDisplay(order) ? (
          <DetailRow
            label="Clave de servicio"
            value={orderServiceKeyDisplay(order)}
          />
        ) : null}
        {order.type === 'credit' && order.isReimbursement ? (
          <DetailRow label="Reembolso" value="Sí" />
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
        {/* La especialidad vive por fila ST: se listan todas las de la orden. */}
        <DetailRow
          label={orderSpecialtyNames.length > 1 ? 'Especialidades' : 'Especialidad'}
          value={orderSpecialtyNames.join(' · ') || order.specialty?.name}
        />
        <DetailRow
          label="Tipos de servicio"
          value={
            order.orderServiceTypes && order.orderServiceTypes.length > 0 ? (
              <ul className="space-y-0.5">
                {order.orderServiceTypes.map((row) => (
                  <li key={row.serviceTypeId}>
                    {row.customName?.trim() || row.serviceType?.name || row.serviceTypeId}
                    {(row.quantity ?? 1) > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (x{row.quantity})
                      </span>
                    )}
                    {row.isIndexed && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-brand-cyan-soft px-2 py-0.5 text-[10px] font-medium text-brand-cyan-strong">
                        Indexado
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.providerType === 'doctor'
                        ? holderDisplayName(row.doctor ?? undefined)
                        : (row.careCenter?.businessName ?? '—')}
                      {row.specialty?.name ? ` · ${row.specialty.name}` : ''}
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
        {priceAdjustmentUsd !== null && (
          <>
            <DetailRow
              label="Monto base (catálogo)"
              value={`${formatMoney(Number(order.priceBaseAmount))} USD`}
              mono
            />
            <DetailRow
              label={priceAdjustmentUsd < 0 ? 'Descuento' : 'Recargo'}
              value={
                <DetailBadge tone={priceAdjustmentUsd < 0 ? 'success' : 'warning'}>
                  {`${priceAdjustmentUsd < 0 ? '−' : '+'}${formatMoney(
                    Math.abs(priceAdjustmentUsd),
                  )} USD`}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Motivo del ajuste"
              value={order.priceAdjustmentNote ?? null}
            />
            <DetailRow
              label="Ajuste aplicado por"
              value={
                order.priceAdjustedBy
                  ? `${orderUserDisplayName(order.priceAdjustedBy)}${
                      order.priceAdjustedAt ? ` · ${fmtDate(order.priceAdjustedAt)}` : ''
                    }`
                  : null
              }
            />
          </>
        )}
        {order?.doctorAmount != null && (
          <DetailRow
            label="Monto al proveedor"
            value={`${formatMoney(order?.doctorAmount)} USD`}
            mono
          />
        )}
        {order.invoiceDate && (
          <DetailRow label="Fecha de factura" value={fmtDay(order.invoiceDate)} />
        )}
        {groupedInvoiceOrders.length > 0 && (
          <DetailRow
            label="Factura agrupada con"
            value={groupedInvoiceOrders
              .map((o) => `N° ${o.orderNumber}`)
              .join(', ')}
            mono
          />
        )}
        {order.invoiceExchangeRate ? (
          <DetailRow
            label="Tasa de la factura"
            value={`1 ${order.invoiceExchangeRate.currency} = ${formatMoney(order.invoiceExchangeRate.amountBs)} Bs.`}
            mono
          />
        ) : (
          order.billingExchangeRate && (
            <DetailRow
              label="Tasa facturación"
              value={`1 ${order.billingExchangeRate.currency} = ${formatMoney(order.billingExchangeRate.amountBs)} Bs.`}
              mono
            />
          )
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

      {(order.otherStudies ||
        (order.providerReports ?? []).some((r) => r.observations)) && (
        <DetailSection title="Informe">
          {order.otherStudies ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Nota general
              </div>
              <p className="text-sm whitespace-pre-wrap">{order.otherStudies}</p>
            </div>
          ) : null}
          {(order.providerReports ?? [])
            .filter((r) => r.observations)
            .map((r) => {
              const pid = r.providerType === 'doctor' ? r.doctorId : r.careCenterId;
              const label =
                providers.find((p) => p.key === `${r.providerType}:${pid}`)?.label ??
                (r.providerType === 'doctor' ? 'Doctor' : 'Centro');
              return (
                <div key={r.id ?? `${r.providerType}:${pid}`} className="space-y-1 mt-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    {label}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{r.observations}</p>
                </div>
              );
            })}
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
                    {p.paymentDate ? formatDateOnly(p.paymentDate) : '—'}
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

      {order.status === 'cancelled' && (
        <DetailSection title="Cancelación">
          <DetailRow
            label="Cancelada"
            value={
              <DetailBadge tone="destructive">
                {order.cancelledAt ? fmtDate(order.cancelledAt) : 'Sí'}
              </DetailBadge>
            }
          />
          <DetailRow label="Motivo" value={order.cancelReason ?? null} />
          <DetailRow
            label="Cancelada por"
            value={
              order.cancelledBy ? orderUserDisplayName(order.cancelledBy) : null
            }
          />
          <DetailRow
            label="Estado al reactivar"
            value={
              order.statusBeforeCancel
                ? ORDER_STATUS_LABEL[order.statusBeforeCancel]
                : null
            }
          />
        </DetailSection>
      )}

      {(order.createdAt || order.updatedAt) && (
        <DetailSection title="Auditoría">
          <DetailRow label="Creada por" value={orderUserDisplayName(order.createdBy)} />
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

      <OrderChangeHistory orderId={order.id} />
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
