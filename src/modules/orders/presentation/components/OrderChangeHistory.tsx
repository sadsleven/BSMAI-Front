import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { DetailSection } from '@/components/ui/detail-dialog';
import { formatMoney } from '@/lib/format/money';
import { formatDateOnly } from '@/lib/dates';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  ORDER_LOG_ACTION_LABEL,
  ORDER_LOG_FIELD_LABEL,
  ORDER_LOG_ID_FIELDS,
  ORDER_TYPE_LABEL,
  orderUserDisplayName,
  type OrderChangeLog,
  type OrderType,
} from '../../domain/models/order';

const MONEY_FIELDS = new Set([
  'priceAmount',
  'casheaFirstInstallmentAmount',
  'doctorAmount',
]);
const BOOL_FIELDS = new Set(['isReimbursement', 'useFixedRate', 'attended']);
const COUNT_FIELDS = new Set(['serviceTypes', 'pathologies', 'payments']);

const INSURANCE_SOURCE_LABEL: Record<string, string> = {
  direct: 'Directo',
  via_contractor: 'Vía contratista',
};

function formatValue(field: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (BOOL_FIELDS.has(field)) return value ? 'Sí' : 'No';
  if (MONEY_FIELDS.has(field)) return `${formatMoney(value as number)} USD`;
  if (field === 'type') return ORDER_TYPE_LABEL[value as OrderType] ?? String(value);
  if (field === 'insuranceSource')
    return INSURANCE_SOURCE_LABEL[String(value)] ?? String(value);
  if (field === 'orderDate') return formatDateOnly(String(value));
  if (field === 'appointmentDate')
    return new Date(String(value)).toLocaleString('es-VE');
  return String(value);
}

function ChangeLine({
  field,
  change,
}: {
  field: string;
  change: { from?: unknown; to?: unknown };
}) {
  const label = ORDER_LOG_FIELD_LABEL[field] ?? field;
  // IDs internos y conteos: no aportan valores legibles — solo "modificado(s)".
  if (ORDER_LOG_ID_FIELDS.has(field)) {
    return (
      <li className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}:</span> modificado
      </li>
    );
  }
  if (COUNT_FIELDS.has(field)) {
    return (
      <li className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}:</span> modificados (
        {String(change.from ?? 0)} → {String(change.to ?? 0)})
      </li>
    );
  }
  const hasFrom = change.from !== undefined;
  const hasTo = change.to !== undefined;
  return (
    <li className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span>{' '}
      {hasFrom ? formatValue(field, change.from) : null}
      {hasFrom && hasTo ? ' → ' : null}
      {hasTo ? formatValue(field, change.to) : null}
    </li>
  );
}

/**
 * Historial de cambios por usuario de la orden. Carga su propia data; si el
 * usuario no puede consultarla (o falla la carga) la sección no se muestra.
 */
export function OrderChangeHistory({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<OrderChangeLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    orderGateway
      .history(orderId)
      .then((rows) => !cancelled && setLogs(rows))
      .catch(() => !cancelled && setLogs(null));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!logs || logs.length === 0) return null;

  return (
    <DetailSection title={`Historial de cambios (${logs.length})`}>
      <ul className="space-y-3">
        {logs.map((log) => (
          <li key={log.id} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue-soft">
              <History className="h-3.5 w-3.5 text-brand-blue-strong" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-sm font-medium">
                {ORDER_LOG_ACTION_LABEL[log.action] ?? log.action}
              </div>
              <div className="text-xs text-muted-foreground">
                {orderUserDisplayName(log.user)} ·{' '}
                {new Date(log.createdAt).toLocaleString('es-VE')}
              </div>
              {log.changes && Object.keys(log.changes).length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(log.changes).map(([field, change]) => (
                    <ChangeLine key={field} field={field} change={change} />
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}
