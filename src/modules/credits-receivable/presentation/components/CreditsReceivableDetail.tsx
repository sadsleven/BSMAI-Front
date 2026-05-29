import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { creditsReceivableGateway } from '../../infrastructure/creditsReceivableGateway';
import { Badge } from '@/components/ui/badge';
import {
  billingRateBs,
  collectedBs,
  collectedOriginal,
  holderDisplayName,
  pendingBs,
  pendingOriginal,
  STATUS_LABEL,
  type CreditsReceivable,
} from '../../domain/models/creditsReceivable';
import { PaymentHistoryList } from '@/modules/accounts-payable/presentation/components/PaymentHistoryList';

export type CreditsReceivableDetailProps = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreditsReceivableDetail({
  accountId,
  open,
  onOpenChange,
}: CreditsReceivableDetailProps) {
  const [account, setAccount] = useState<CreditsReceivable | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !accountId) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    creditsReceivableGateway
      .getById(accountId)
      .then((a) => {
        if (!cancelled) setAccount(a);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el crédito.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, open]);

  const statusTone = (s: CreditsReceivable['status']) =>
    s === 'collected'
      ? 'success'
      : s === 'overcollected'
        ? 'info'
        : s === 'partially_collected'
          ? 'info'
          : 'warning';

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Receipt}
      title={
        account ? `Crédito por cobrar N° ${account.creditNumber}` : 'Detalle de crédito'
      }
      loading={loading}
    >
      {account ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="N° crédito" value={account.creditNumber} mono />
            <DetailRow label="N° orden" value={account.order.orderNumber} mono />
            <DetailRow label="Titular" value={holderDisplayName(account.holder)} />
            <DetailRow
              label="Monto orden"
              value={`${Number(account.order.priceAmount).toFixed(2)} ${account.order.priceCurrency}`}
              mono
            />
            <DetailRow
              label="Estado"
              value={
                <DetailBadge tone={statusTone(account.status)}>
                  {STATUS_LABEL[account.status]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Cobrado el"
              value={
                account.collectedAt
                  ? new Date(account.collectedAt).toLocaleString('es-VE')
                  : null
              }
            />
          </DetailSection>

          {(() => {
            const cBs = collectedBs(account);
            const cOrig = collectedOriginal(account);
            const pBs = pendingBs(account);
            const pOrig = pendingOriginal(account);
            const rateBs = billingRateBs(account);
            const cur = account.order.priceCurrency;
            return (
              <DetailSection title="Saldo">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Total a cobrar
                    </div>
                    <div className="text-lg font-semibold">
                      {Number(account.order.priceAmount).toFixed(2)} {cur}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Total cobrado
                    </div>
                    <div className="text-lg font-semibold">
                      {cOrig !== null
                        ? `${cOrig.toFixed(2)} ${cur}`
                        : `${cBs.toFixed(2)} Bs.`}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Diferencia
                    </div>
                    <div className="text-lg font-semibold flex items-center gap-2">
                      {pBs === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : Math.abs(pBs) <= 0.01 ? (
                        <Badge variant="default" className="bg-success text-white">
                          Cuadrado
                        </Badge>
                      ) : pBs < 0 ? (
                        <Badge variant="default" className="bg-brand-blue text-white">
                          Excede{' '}
                          {pOrig !== null
                            ? `${Math.abs(pOrig).toFixed(2)} ${cur}`
                            : `${Math.abs(pBs).toFixed(2)} Bs.`}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-warning text-white">
                          Faltan{' '}
                          {pOrig !== null
                            ? `${pOrig.toFixed(2)} ${cur}`
                            : `${pBs.toFixed(2)} Bs.`}
                        </Badge>
                      )}
                    </div>
                    {pBs !== null && Math.abs(pBs) >= 0.01 && (
                      <div className="text-xs text-muted-foreground">
                        {pBs > 0 ? 'Faltan' : 'Excede'}{' '}
                        <span className="font-mono">
                          Bs.{' '}
                          {Math.abs(pBs).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        {rateBs !== null && (
                          <span className="ml-1 text-[10px]">
                            (tasa {rateBs.toFixed(2)} Bs/{cur})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </DetailSection>
            );
          })()}

          <DetailSection title={`Cobros registrados (${account.payments?.length ?? 0})`}>
            <PaymentHistoryList
              payments={account.payments}
              emptyLabel="Sin cobros registrados."
            />
          </DetailSection>

          {(account.createdAt || account.updatedAt) && (
            <DetailSection title="Auditoría">
              {account.createdAt && (
                <DetailRow
                  label="Creado"
                  value={new Date(account.createdAt).toLocaleString('es-VE')}
                />
              )}
              {account.updatedAt && (
                <DetailRow
                  label="Actualizado"
                  value={new Date(account.updatedAt).toLocaleString('es-VE')}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
