import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { accountsPayableGateway } from '../../infrastructure/accountsPayableGateway';
import { Badge } from '@/components/ui/badge';
import {
  amountToReceiveUsd,
  effectiveStatus,
  EFFECTIVE_STATUS_LABEL,
  paidUsd,
  pendingUsd,
  recipientName,
  type AccountsPayable,
  type EffectiveAccountsPayableStatus,
} from '../../domain/models/accountsPayable';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { PaymentHistoryList } from './PaymentHistoryList';

export type AccountsPayableDetailProps = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountsPayableDetail({
  accountId,
  open,
  onOpenChange,
}: AccountsPayableDetailProps) {
  const [account, setAccount] = useState<AccountsPayable | null>(null);
  const [loading, setLoading] = useState(false);
  const [usdRate, setUsdRate] = useState<ExchangeRate | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    exchangeRateGateway
      .getCurrent('USD')
      .then((r) => !cancelled && setUsdRate(r))
      .catch(() => !cancelled && setUsdRate(null));
    return () => {
      cancelled = true;
    };
  }, [open]);
  useEffect(() => {
    if (!open || !accountId) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    accountsPayableGateway
      .getById(accountId)
      .then((a) => {
        if (!cancelled) setAccount(a);
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
  }, [accountId, open]);

  const ar = account ? amountToReceiveUsd(account) : null;
  const pd = account ? paidUsd(account) : 0;
  const pUsd = account ? pendingUsd(account) : null;
  const statusTone = (s: EffectiveAccountsPayableStatus) =>
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
      icon={Wallet}
      title={account ? `Cuenta por pagar N° ${account.payableNumber}` : 'Detalle de cuenta'}
      loading={loading}
    >
      {account ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="N° cuenta" value={account.payableNumber} mono />
            <DetailRow label="N° orden" value={account.order.orderNumber} mono />
            <DetailRow label="Destinatario" value={recipientName(account)} />
            <DetailRow
              label="Tipo"
              value={account.recipientType === 'doctor' ? 'Doctor' : 'Centro'}
            />
            <DetailRow
              label="Monto al doctor"
              value={
                account.order?.doctorAmount
                  ? `${Number(account.order?.doctorAmount).toFixed(2)} USD`
                  : null
              }
              mono
            />
            <DetailRow
              label="Monto a recibir"
              value={ar !== null ? `${ar.toFixed(2)} USD` : null}
              mono
            />
            <DetailRow
              label="Estado"
              value={
                <DetailBadge tone={statusTone(effectiveStatus(account))}>
                  {EFFECTIVE_STATUS_LABEL[effectiveStatus(account)]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Pagada el"
              value={account.paidAt ? new Date(account.paidAt).toLocaleString('es-VE') : null}
            />
          </DetailSection>

          <DetailSection title="Saldo">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a pagar
                </div>
                <div className="text-lg font-semibold">
                  {ar !== null ? `${ar.toFixed(2)} USD` : '—'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total pagado
                </div>
                <div className="text-lg font-semibold">{pd.toFixed(2)} USD</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {pUsd === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : pUsd <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-warning text-white">
                      Faltan {pUsd.toFixed(2)} USD
                    </Badge>
                  )}
                </div>
                {pUsd !== null && pUsd > 0.01 && usdRate ? (
                  <div className="text-xs text-muted-foreground">
                    Faltan{' '}
                    <span className="font-mono">
                      Bs{' '}
                      {(pUsd * Number(usdRate.amountBs)).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </DetailSection>

          <DetailSection title={`Pagos registrados (${account.payments?.length ?? 0})`}>
            <PaymentHistoryList payments={account.payments} />
          </DetailSection>

          {(account.createdAt || account.updatedAt) && (
            <DetailSection title="Auditoría">
              {account.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(account.createdAt).toLocaleString('es-VE')}
                />
              )}
              {account.updatedAt && (
                <DetailRow
                  label="Actualizada"
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
