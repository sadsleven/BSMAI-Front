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
  estimatedNetUsd,
  paidUsd,
  pendingUsd,
  recipientName,
  type AccountsPayable,
  type EffectiveAccountsPayableStatus,
} from '../../domain/models/accountsPayable';
import { useTaxUnit } from '@/lib/taxes/useTaxUnit';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { PaymentHistoryList } from './PaymentHistoryList';
import { formatMoney } from '@/lib/format/money';

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

  const { taxUnit } = useTaxUnit();
  const taxUnitBs = taxUnit ? Number(taxUnit.amountBs) : null;

  const ar = account ? amountToReceiveUsd(account) : null;
  const pd = account ? paidUsd(account) : 0;
  const pUsd = account ? pendingUsd(account, taxUnitBs) : null;
  const netUsd = account ? estimatedNetUsd(account, taxUnitBs) : null;
  const retentionUsd =
    ar !== null && netUsd !== null && ar - netUsd > 0.005
      ? Math.round((ar - netUsd) * 100) / 100
      : null;
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
                  ? `${formatMoney(account.order?.doctorAmount)} USD`
                  : null
              }
              mono
            />
            <DetailRow
              label="Monto a recibir"
              value={ar !== null ? `${formatMoney(ar)} USD` : null}
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
                  Total a pagar (bruto)
                </div>
                <div className="text-lg font-semibold">
                  {ar !== null ? `${formatMoney(ar)} USD` : '—'}
                </div>
              </div>
              {retentionUsd !== null && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    Retención SENIAT
                  </div>
                  <div className="text-lg font-semibold">
                    −{formatMoney(retentionUsd)} USD
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Va al SENIAT como retención por pagar, no al proveedor.
                  </div>
                </div>
              )}
              {netUsd !== null && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    Neto a entregar
                  </div>
                  <div className="text-lg font-semibold">
                    {formatMoney(netUsd)} USD
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total pagado
                </div>
                <div className="text-lg font-semibold">{formatMoney(pd)} USD</div>
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
                      Faltan {formatMoney(pUsd)} USD
                    </Badge>
                  )}
                </div>
                {pUsd !== null && pUsd > 0.01 && usdRate ? (
                  <div className="text-xs text-muted-foreground">
                    Faltan{' '}
                    <span className="font-mono">
                      Bs{' '}
                      {formatMoney(pUsd * Number(usdRate.amountBs))}
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
