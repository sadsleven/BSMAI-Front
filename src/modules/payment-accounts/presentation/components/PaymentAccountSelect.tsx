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

/** Valor del ítem informativo (deshabilitado) cuando no hay cuentas. */
const EMPTY_SENTINEL = '__no_payment_account__';

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

  // Autoselección: ninguna cuenta elegida → seleccionar la primera asignable
  // una vez cargadas.
  useEffect(() => {
    if (loading || value) return;
    if (accounts.length > 0) {
      onChange(accounts[0].id, accounts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, value, accounts]);

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
    if (id === EMPTY_SENTINEL) return;
    const acc = items.find((a) => a.id === id);
    onChange(id, acc);
  };

  const selected = value ? items.find((a) => a.id === value) ?? null : null;

  return (
    <Select value={value || ''} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          'h-9',
          error && 'border-destructive',
        )}
      >
        {/*
         * IMPORTANTE: el contenido custom debe ir DENTRO de <SelectValue>.
         * El <SelectContent> global usa position="item-aligned", que requiere
         * el nodo Select.Value en el trigger para posicionar el menú; sin él,
         * el dropdown nunca se muestra al hacer click.
         */}
        <SelectValue
          placeholder={
            loading
              ? 'Cargando…'
              : placeholder ?? `Cuenta de ${PAYMENT_ACCOUNT_TYPE_LABEL[type]}`
          }
        >
          {selected ? (
            <span className="truncate text-left">
              {selected.name}
              {paymentAccountSummary(selected) ? (
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {paymentAccountSummary(selected)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {loading
                ? 'Cargando…'
                : placeholder ?? `Cuenta de ${PAYMENT_ACCOUNT_TYPE_LABEL[type]}`}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          /*
           * Debe ser un <SelectItem> (deshabilitado), no un <div>: con
           * position="item-aligned" Radix necesita al menos un ítem para
           * posicionar el menú; con cero ítems bloquea el scroll del body
           * pero no pinta nada. El sentinel nunca llega a `onChange`.
           */
          <SelectItem value={EMPTY_SENTINEL} disabled>
            <span className="text-xs text-muted-foreground">
              {loading
                ? 'Cargando…'
                : `No tiene cuenta de ${PAYMENT_ACCOUNT_TYPE_LABEL[type]} registrada`}
            </span>
          </SelectItem>
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
