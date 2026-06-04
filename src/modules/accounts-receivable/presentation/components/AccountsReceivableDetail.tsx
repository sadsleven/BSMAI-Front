import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import { Badge } from '@/components/ui/badge';
import {
  casheaCommissionOf,
  collectedBs,
  collectedUsd,
  debtorDisplayName,
  debtorTypeOf,
  isCasheaAccount,
  isFixedRateAccount,
  pendingBs,
  pendingUsd,
  STATUS_LABEL,
  targetBs,
  targetUsd,
  type AccountsReceivable,
} from '../../domain/models/accountsReceivable';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { PaymentHistoryList } from '@/modules/accounts-payable/presentation/components/PaymentHistoryList';

export type AccountsReceivableDetailProps = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountsReceivableDetail({
  accountId,
  open,
  onOpenChange,
}: AccountsReceivableDetailProps) {
  const [account, setAccount] = useState<AccountsReceivable | null>(null);
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
    accountsReceivableGateway
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

  const statusTone = (s: AccountsReceivable['status']) =>
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
        account ? `Cuenta por cobrar N° ${account.receivableNumber}` : 'Detalle de cuenta'
      }
      loading={loading}
    >
      {account ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="N° cuenta" value={account.receivableNumber} mono />
            <DetailRow label="N° orden" value={account.order.orderNumber} mono />
            <DetailRow
              label={
                isCasheaAccount(account)
                  ? 'Titular (Cashea)'
                  : debtorTypeOf(account) === 'holder'
                    ? 'Titular (crédito)'
                    : 'Seguro'
              }
              value={debtorDisplayName(account)}
            />
            <DetailRow
              label="Precio orden"
              value={`${Number(account.order.priceAmount).toFixed(2)} USD`}
              mono
            />
            {isCasheaAccount(account) ? (
              <>
                <DetailRow
                  label={`Comisión Cashea (${(casheaCommissionOf(account) * 100).toFixed(2)}%)`}
                  value={`-${(
                    Number(account.order.priceAmount) * casheaCommissionOf(account)
                  ).toFixed(2)} USD`}
                  mono
                />
                <DetailRow
                  label="Neto a cobrar"
                  value={`${(targetUsd(account) ?? 0).toFixed(2)} USD`}
                  mono
                />
              </>
            ) : null}
            {isFixedRateAccount(account) ? (
              <>
                <DetailRow
                  label="Tasa fija USD/Bs"
                  value={`Bs. ${Number(account.order.fixedExchangeRate?.amountBs ?? 0).toFixed(2)} · ${new Date(account.order.fixedExchangeRate?.effectiveDate ?? '').toLocaleDateString('es-VE')}`}
                  mono
                />
                <DetailRow
                  label="Total a cobrar (Bs)"
                  value={`${(targetBs(account) ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`}
                  mono
                />
              </>
            ) : null}
            <DetailRow
              label="Estado"
              value={
                <DetailBadge tone={statusTone(account.status)}>
                  {STATUS_LABEL[account.status]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Cobrada el"
              value={
                account.collectedAt
                  ? new Date(account.collectedAt).toLocaleString('es-VE')
                  : null
              }
            />
          </DetailSection>

          {(() => {
            const fixed = isFixedRateAccount(account);
            const unit = fixed ? 'Bs' : 'USD';
            const target = fixed ? targetBs(account) ?? 0 : targetUsd(account) ?? 0;
            const collected = fixed ? collectedBs(account) : collectedUsd(account);
            const pending = fixed ? pendingBs(account) : pendingUsd(account);
            const fmt = (n: number) =>
              fixed
                ? n.toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : n.toFixed(2);
            return (
              <DetailSection title="Saldo">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Total a cobrar
                    </div>
                    <div className="text-lg font-semibold">
                      {fmt(target)} {unit}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Total cobrado
                    </div>
                    <div className="text-lg font-semibold">
                      {fmt(collected)} {unit}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      Diferencia
                    </div>
                    <div className="text-lg font-semibold flex items-center gap-2">
                      {pending === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : Math.abs(pending) <= 0.01 ? (
                        <Badge variant="default" className="bg-success text-white">
                          Cuadrado
                        </Badge>
                      ) : pending < 0 ? (
                        <Badge variant="default" className="bg-brand-blue text-white">
                          Excede {fmt(Math.abs(pending))} {unit}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-warning text-white">
                          Faltan {fmt(pending)} {unit}
                        </Badge>
                      )}
                    </div>
                    {pending !== null && Math.abs(pending) > 0.01 && !fixed && usdRate ? (
                      <div className="text-xs text-muted-foreground">
                        {pending < 0 ? 'Excede' : 'Faltan'}{' '}
                        <span className="font-mono">
                          Bs{' '}
                          {(
                            Math.abs(pending) * Number(usdRate.amountBs)
                          ).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ) : null}
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
