import { useEffect, useState } from 'react';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { Badge } from '@/components/ui/badge';
import { Hospital, Wallet, Banknote, FileText } from 'lucide-react';
import { careCenterGateway } from '../../infrastructure/careCenterGateway';
import type { CareCenter } from '../../domain/models/careCenter';
import type { Bank } from '@/modules/banks/domain/models/bank';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import { notify } from '@/lib/notifications/toast';
import { ServicePricesDetailTable } from '@/components/ui/service-prices-detail-table';

const TYPE_LABEL = {
  mobile_payment: 'Pago Móvil',
  bank_transfer: 'Transferencia',
  other: 'Otro',
} as const;

const TYPE_ICON = {
  mobile_payment: Wallet,
  bank_transfer: Banknote,
  other: FileText,
} as const;

export type CareCenterDetailProps = {
  centerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Cuerpo reutilizado por el modal `CareCenterDetail` y la página `CareCenterDetailPage`. */
export function CareCenterDetailBody({
  center,
  banks,
}: {
  center: CareCenter;
  banks: Map<string, Bank>;
}) {
  return (
    <div className="divide-y">
          <DetailSection title="Datos del centro">
            <DetailRow label="Razón social" value={center.businessName} />
            <DetailRow label="RIF" value={center.rif} mono />
            <DetailRow label="Email" value={center.email} />
            <DetailRow
              label="Estado"
              value={
                center.deletedAt ? (
                  <DetailBadge tone="destructive">En papelera</DetailBadge>
                ) : center.isActive ? (
                  <DetailBadge tone="success">Habilitado</DetailBadge>
                ) : (
                  <DetailBadge tone="warning">Deshabilitado</DetailBadge>
                )
              }
            />
          </DetailSection>

          <DetailSection title={`Teléfonos (${center.phones?.length ?? 0})`}>
            {center.phones?.length ? (
              <ul className="space-y-1.5">
                {center.phones.map((p) => (
                  <li
                    key={p.id ?? p.number}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-mono">{p.number}</span>
                    {p.label && (
                      <span className="text-xs text-muted-foreground">{p.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin teléfonos.</p>
            )}
          </DetailSection>

          <DetailSection title={`Especialidades (${center.specialties?.length ?? 0})`}>
            {center.specialties?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {center.specialties.map((s) => (
                  <Badge key={s.id} variant="outline">
                    {s.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin especialidades.</p>
            )}
          </DetailSection>

          <DetailSection title={`Precios por tipo de servicio (${center.servicePrices?.length ?? 0})`}>
            <ServicePricesDetailTable prices={center.servicePrices ?? []} />
          </DetailSection>

          <DetailSection title={`Métodos de pago (${center.paymentMethods?.length ?? 0})`}>
            {center.paymentMethods?.length ? (
              <ul className="space-y-2">
                {center.paymentMethods.map((m, i) => {
                  const Icon = TYPE_ICON[m.type];
                  const bank = m.bankCode ? banks.get(m.bankCode) : null;
                  return (
                    <li
                      key={m.id ?? i}
                      className="border rounded-lg p-3 bg-muted/10 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-brand-blue-soft text-brand-blue flex items-center justify-center">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm font-medium">{TYPE_LABEL[m.type]}</span>
                      </div>
                      {m.type === 'mobile_payment' && (
                        <>
                          {bank && (
                            <DetailRow
                              label="Banco"
                              value={`${bank.code} — ${bank.name}`}
                            />
                          )}
                          <DetailRow label="Teléfono" value={m.phoneNumber} mono />
                          <DetailRow label="Cédula/RIF" value={m.idDocument} mono />
                        </>
                      )}
                      {m.type === 'bank_transfer' && (
                        <>
                          {bank && (
                            <DetailRow
                              label="Banco"
                              value={`${bank.code} — ${bank.name}`}
                            />
                          )}
                          <DetailRow label="Cuenta" value={m.accountNumber} mono />
                          <DetailRow label="Titular" value={m.accountHolderName} />
                          <DetailRow label="Cédula/RIF" value={m.idDocument} mono />
                        </>
                      )}
                      {m.type === 'other' && (
                        <DetailRow label="Descripción" value={m.description} />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin métodos de pago.</p>
            )}
          </DetailSection>

      {(center.createdAt || center.updatedAt) && (
        <DetailSection title="Auditoría">
          {center.createdAt && (
            <DetailRow
              label="Creado"
              value={new Date(center.createdAt).toLocaleString()}
            />
          )}
          {center.updatedAt && (
            <DetailRow
              label="Actualizado"
              value={new Date(center.updatedAt).toLocaleString()}
            />
          )}
        </DetailSection>
      )}
    </div>
  );
}

export function CareCenterDetail({ centerId, open, onOpenChange }: CareCenterDetailProps) {
  const [center, setCenter] = useState<CareCenter | null>(null);
  const [banks, setBanks] = useState<Map<string, Bank>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !centerId) {
      setCenter(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([careCenterGateway.getById(centerId), bankGateway.list()])
      .then(([c, bs]) => {
        if (cancelled) return;
        setCenter(c);
        const map = new Map<string, Bank>();
        for (const b of bs) map.set(b.code, b);
        setBanks(map);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar el centro.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centerId, open]);

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Hospital}
      title={center ? center.businessName : 'Detalle del centro'}
      subtitle={center?.email}
      loading={loading}
    >
      {center ? <CareCenterDetailBody center={center} banks={banks} /> : null}
    </DetailDialog>
  );
}
