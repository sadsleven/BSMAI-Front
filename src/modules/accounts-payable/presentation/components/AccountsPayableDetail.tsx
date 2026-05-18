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
  amountToReceive,
  billingRateBs,
  effectiveStatus,
  EFFECTIVE_STATUS_LABEL,
  paidBs,
  paidOriginal,
  pendingBs,
  pendingOriginal,
  recipientName,
  type AccountsPayable,
  type EffectiveAccountsPayableStatus,
} from '../../domain/models/accountsPayable';
import { useTaxRates } from '@/lib/config/taxRates';
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
  const taxRates = useTaxRates();

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

  const ar = account ? amountToReceive(account, taxRates) : null;
  const pdBs = account ? paidBs(account) : 0;
  const pdOrig = account ? paidOriginal(account) : null;
  const pBs = account ? pendingBs(account, taxRates) : null;
  const pOrig = account ? pendingOriginal(account, taxRates) : null;
  const rateBs = account ? billingRateBs(account) : null;
  const origCurrency = account?.order.doctorAmountCurrency ?? null;
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
                  ? `${Number(account.order?.doctorAmount).toFixed(2)} ${account.order.doctorAmountCurrency}`
                  : null
              }
              mono
            />
            <DetailRow
              label="Monto a recibir"
              value={
                ar !== null
                  ? `${ar.toFixed(2)} ${account.order.doctorAmountCurrency}`
                  : null
              }
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
                  {ar !== null && origCurrency
                    ? `${ar.toFixed(2)} ${origCurrency}`
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
