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
  /**
   * Notifica la cuenta completa resuelta para `value` (del catálogo o por id),
   * sin que el usuario la elija. Sirve para que el padre cachee la cuenta de un
   * pago ya guardado y pueda mostrar sus datos.
   */
  onResolve?: (account: PaymentAccount) => void;
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
  onResolve,
  disabled,
  error,
  placeholder,
}: PaymentAccountSelectProps) {
  // El catálogo se guarda junto al tipo con el que se pidió: al cambiar de tipo
  // de pago, la lista del tipo anterior queda obsoleta en el mismo render y no
  // debe alimentar la autoselección (si no, se elige una cuenta de otro tipo y
  // el ítem aparece marcado "Tipo distinto").
  const [loaded, setLoaded] = useState<{
    type: PaymentAccountType;
    list: PaymentAccount[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  /** Cuenta resuelta por id cuando no está en el catálogo asignable (stale). */
  const [fetched, setFetched] = useState<PaymentAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    paymentAccountGateway
      .listAssignable({ type })
      .then((list) => {
        if (!cancelled) setLoaded({ type, list });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ type, list: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const accounts = useMemo(
    () => (loaded && loaded.type === type ? loaded.list : []),
    [loaded, type],
  );
  /** Catálogo del tipo actual ya cargado. */
  const ready = !loading && !!loaded && loaded.type === type;

  // Autoselección: ninguna cuenta elegida → seleccionar la primera asignable
  // del tipo actual, una vez cargadas.
  useEffect(() => {
    if (!ready || disabled || value) return;
    if (accounts.length > 0) {
      onChange(accounts[0].id, accounts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, disabled, value, accounts]);

  // Cuenta ya guardada que no está en el catálogo asignable (en papelera,
  // deshabilitada o de otro tipo): se busca por id para poder mostrarla.
  useEffect(() => {
    if (!ready || !value) return;
    if (currentAccount?.id === value) return;
    if (fetched?.id === value) return;
    if (accounts.some((a) => a.id === value)) return;
    let cancelled = false;
    paymentAccountGateway
      .getById(value)
      .then((a) => {
        if (!cancelled) setFetched(a);
      })
      .catch(() => {
        /* cuenta inaccesible: queda el placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, value, currentAccount, fetched, accounts]);

  const items = useMemo(() => {
    const map = new Map<string, PaymentAccount>();
    for (const a of accounts) map.set(a.id, a);
    // La entrada stale sólo aplica a la cuenta seleccionada; si no, quedarían
    // cuentas de un tipo anterior colgando en el menú.
    const stale = currentAccount ?? fetched;
    if (stale && stale.id === value && !map.has(stale.id)) {
      map.set(stale.id, stale);
    }
    return Array.from(map.values());
  }, [accounts, currentAccount, fetched, value]);

  const isStale = (a: PaymentAccount) =>
    !!a.deletedAt || !a.isActive || a.type !== type;

  const handleChange = (id: string) => {
    if (id === EMPTY_SENTINEL) return;
    const acc = items.find((a) => a.id === id);
    onChange(id, acc);
  };

  const selected = value ? items.find((a) => a.id === value) ?? null : null;

  // Deja la cuenta del pago guardado en el caché del padre (datos de display).
  useEffect(() => {
    if (selected) onResolve?.(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
