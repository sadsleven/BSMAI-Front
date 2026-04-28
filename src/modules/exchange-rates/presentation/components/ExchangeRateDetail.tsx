import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { TrendingUp } from 'lucide-react';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '../../domain/models/exchangeRate';
import { notify } from '@/lib/notifications/toast';
import { formatBs } from '../utils/format';

export type ExchangeRateDetailProps = {
  rateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ExchangeRateDetail({ rateId, open, onOpenChange }: ExchangeRateDetailProps) {
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !rateId) {
      setRate(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    exchangeRateGateway
      .getById(rateId)
      .then((r) => {
        if (!cancelled) setRate(r);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la tasa de cambio.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rateId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={TrendingUp}
      title={rate ? `Tasa ${rate.currency}` : 'Detalle de la tasa'}
      loading={loading}
    >
      {rate ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="Moneda" value={rate.currency} />
            <DetailRow
              label="Monto"
              value={`Bs. ${formatBs(rate.amountBs)} por 1 ${rate.currency}`}
            />
            <DetailRow
              label="Fecha y hora efectiva"
              value={new Date(rate.effectiveDate).toLocaleString('es-VE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <DetailRow
              label="Estado"
              value={
                rate.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : rate.isActive ? (
                  <DetailBadge tone="success">Habilitada</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitada</DetailBadge>
                )
              }
            />
          </DetailSection>
          {(rate.createdAt || rate.updatedAt) && (
            <DetailSection title="Auditoría">
              {rate.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(rate.createdAt).toLocaleString()}
                />
              )}
              {rate.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(rate.updatedAt).toLocaleString()}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
