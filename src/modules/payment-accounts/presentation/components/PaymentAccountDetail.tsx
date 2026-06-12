import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Wallet } from 'lucide-react';
import { paymentAccountGateway } from '../../infrastructure/paymentAccountGateway';
import {
  PAYMENT_ACCOUNT_TYPE_LABEL,
  type PaymentAccount,
} from '../../domain/models/paymentAccount';
import { notify } from '@/lib/notifications/toast';

export type PaymentAccountDetailProps = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PaymentAccountDetail({
  accountId,
  open,
  onOpenChange,
}: PaymentAccountDetailProps) {
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !accountId) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    paymentAccountGateway
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

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Wallet}
      title={account ? account.name : 'Detalle de la cuenta'}
      loading={loading}
    >
      {account ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Nombre" value={account.name} />
            <DetailRow
              label="Tipo"
              value={
                <DetailBadge tone="info">
                  {PAYMENT_ACCOUNT_TYPE_LABEL[account.type]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Estado"
              value={
                account.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : account.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>

          {account.type === 'mobile_payment' && (
            <DetailSection title="Datos del Pago Móvil">
              <DetailRow label="Banco" value={account.bankCode} />
              <DetailRow label="Teléfono" value={account.phoneNumber} />
              <DetailRow label="Cédula/RIF" value={account.idDocument} />
              <DetailRow label="Titular" value={account.accountHolderName} />
            </DetailSection>
          )}

          {account.type === 'bank_transfer' && (
            <DetailSection title="Datos de la cuenta">
              <DetailRow label="Banco" value={account.bankCode} />
              <DetailRow label="Número de cuenta" value={account.accountNumber} />
              <DetailRow label="Titular" value={account.accountHolderName} />
              <DetailRow label="Cédula/RIF del titular" value={account.idDocument} />
            </DetailSection>
          )}

          {account.type === 'other' && (
            <DetailSection title="Detalle">
              <DetailRow label="Descripción" value={account.description} />
            </DetailSection>
          )}

          {(account.createdAt || account.updatedAt) && (
            <DetailSection title="Auditoría">
              {account.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(account.createdAt).toLocaleString()}
                />
              )}
              {account.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(account.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
