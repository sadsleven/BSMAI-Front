import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { Badge } from '@/components/ui/badge';
import { taxesPayableGateway } from '../../infrastructure/taxesPayableGateway';
import {
  billingRateBs,
  effectiveStatus,
  EFFECTIVE_STATUS_LABEL,
  paidBs,
  paidOriginal,
  pendingBs,
  pendingOriginal,
  recipientName,
  taxAmount,
  type EffectiveTaxPayableStatus,
  type TaxPayable,
} from '../../domain/models/taxesPayable';
import { PaymentHistoryList } from '@/modules/accounts-payable/presentation/components/PaymentHistoryList';

export type TaxesPayableDetailProps = {
  taxPayableId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TaxesPayableDetail({
  taxPayableId,
  open,
  onOpenChange,
}: TaxesPayableDetailProps) {
  const [tax, setTax] = useState<TaxPayable | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !taxPayableId) {
      setTax(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    taxesPayableGateway
      .getById(taxPayableId)
      .then((t) => {
        if (!cancelled) setTax(t);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la cuenta.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxPayableId, open]);

  const amt = tax ? taxAmount(tax) : null;
  const pdBs = tax ? paidBs(tax) : 0;
  const pdOrig = tax ? paidOriginal(tax) : null;
  const pBs = tax ? pendingBs(tax) : null;
  const pOrig = tax ? pendingOriginal(tax) : null;
  const rateBs = tax ? billingRateBs(tax) : null;
  const origCurrency = tax?.taxAmountCurrency ?? null;
  const ratePct = tax?.taxRate ? (Number(tax.taxRate) * 100).toFixed(2) : null;
  const statusTone = (s: EffectiveTaxPayableStatus) =>
    s === 'paid'
      ? 'success'
      : s === 'partially_paid'
        ? 'info'
        : s === 'undefined'
          ? 'neutral'
          : 'warning';

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Receipt}
      title={tax ? `Impuesto por pagar N° ${tax.taxPayableNumber}` : 'Detalle'}
      loading={loading}
    >
      {tax ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="N° cuenta" value={tax.taxPayableNumber} mono />
            <DetailRow label="N° orden" value={tax.order.orderNumber} mono />
            <DetailRow label="Destinatario relacionado" value={recipientName(tax)} />
            <DetailRow
              label="Tipo"
              value={tax.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
            />
            <DetailRow
              label="Tasa de retención"
              value={ratePct ? `${ratePct}%` : null}
            />
            <DetailRow
              label="Monto a pagar al fisco"
              value={amt !== null ? `${amt.toFixed(2)} ${origCurrency ?? ''}` : null}
              mono
            />
            <DetailRow
              label="Estado"
              value={
                <DetailBadge tone={statusTone(effectiveStatus(tax))}>
                  {EFFECTIVE_STATUS_LABEL[effectiveStatus(tax)]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Pagada el"
              value={tax.paidAt ? new Date(tax.paidAt).toLocaleString('es-VE') : null}
            />
          </DetailSection>

          <DetailSection title="Saldo">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a pagar
                </div>
                <div className="text-lg font-semibold">
                  {amt !== null && origCurrency
                    ? `${amt.toFixed(2)} ${origCurrency}`
                    : '—'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total pagado
                </div>
                <div className="text-lg font-semibold">
                  {pdOrig !== null && origCurrency
                    ? `${pdOrig.toFixed(2)} ${origCurrency}`
                    : `${pdBs.toFixed(2)} Bs.`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {pBs === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : pBs <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-warning text-white">
                      Faltan{' '}
                      {pOrig !== null && origCurrency
                        ? `${pOrig.toFixed(2)} ${origCurrency}`
                        : `${pBs.toFixed(2)} Bs.`}
                    </Badge>
                  )}
                </div>
                {pBs !== null && pBs > 0.01 && (
                  <div className="text-xs text-muted-foreground">
                    Faltan{' '}
                    <span className="font-mono">
                      Bs.{' '}
                      {pBs.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    {rateBs !== null && origCurrency && origCurrency !== 'BS' && (
                      <span className="ml-1 text-[10px]">
                        (tasa {rateBs.toFixed(2)} Bs/{origCurrency})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DetailSection>

          <DetailSection title={`Pagos registrados (${tax.payments?.length ?? 0})`}>
            <PaymentHistoryList payments={tax.payments} />
          </DetailSection>

          {(tax.createdAt || tax.updatedAt) && (
            <DetailSection title="Auditoría">
              {tax.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(tax.createdAt).toLocaleString('es-VE')}
                />
              )}
              {tax.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(tax.updatedAt).toLocaleString('es-VE')}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
