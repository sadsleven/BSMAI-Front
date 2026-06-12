import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { paymentAccountGateway } from '../../infrastructure/paymentAccountGateway';
import {
  PAYMENT_ACCOUNT_TYPE_LABEL,
  paymentAccountSummary,
  type PaymentAccount,
  type PaymentAccountType,
} from '../../domain/models/paymentAccount';

export type PaymentAccountSelectProps = {
  /** ID de la cuenta seleccionada (string vacío = ninguna). */
  value: string;
  /** Notifica nuevo ID y, si está en cache, la cuenta completa. */
  onChange: (id: string, account?: PaymentAccount) => void;
  /** Tipo de pago — restringe las opciones del catálogo. */
  type: PaymentAccountType;
  /** Cuenta actualmente referenciada (para mostrar entradas stale). */
  currentAccount?: PaymentAccount | null;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
};

/**
 * Selector global para elegir una `PaymentAccount` por tipo de pago.
 * Carga con `listAssignable({type})` y reusa una cache local por type
 * para evitar refetch en cada render de fila.
 */
export function PaymentAccountSelect({
  value,
  onChange,
  type,
  currentAccount,
  disabled,
  error,
  placeholder,
}: PaymentAccountSelectProps) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    paymentAccountGateway
      .listAssignable({ type })
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const items = useMemo(() => {
    const map = new Map<string, PaymentAccount>();
    for (const a of accounts) map.set(a.id, a);
    if (currentAccount && !map.has(currentAccount.id)) {
      map.set(currentAccount.id, currentAccount);
    }
    return Array.from(map.values());
  }, [accounts, currentAccount]);

  const isStale = (a: PaymentAccount) =>
    !!a.deletedAt || !a.isActive || a.type !== type;

  const handleChange = (id: string) => {
    const acc = items.find((a) => a.id === id);
    onChange(id, acc);
  };

  return (
    <Select value={value || ''} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          'h-9',
          error && 'border-destructive',
        )}
      >
        <SelectValue
          placeholder={
            loading
              ? 'Cargando…'
              : placeholder ?? `Cuenta de ${PAYMENT_ACCOUNT_TYPE_LABEL[type]}`
          }
        />
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No hay cuentas disponibles para este tipo.
          </div>
        ) : (
          items.map((a) => {
            const stale = isStale(a);
            return (
              <SelectItem key={a.id} value={a.id}>
                <div className="flex flex-col leading-tight">
                  <span className="font-medium">
                    {a.name}
                    {stale ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-warning">
                        {a.deletedAt
                          ? 'En papelera'
                          : !a.isActive
                            ? 'Deshabilitada'
                            : 'Tipo distinto'}
                      </span>
                    ) : null}
                  </span>
                  {paymentAccountSummary(a) ? (
                    <span className="text-[11px] text-muted-foreground">
                      {paymentAccountSummary(a)}
                    </span>
                  ) : null}
                </div>
              </SelectItem>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
