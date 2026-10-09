import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import type { Currency, ExchangeRate } from '../../domain/models/exchangeRate';
import { QuickExchangeRateModal } from './QuickExchangeRateModal';

export interface UsdRateSelectProps {
  rates: ExchangeRate[];
  selectedId: string;
  /** Marca la tasa más actual con "· actual". */
  currentRateId?: string | null;
  onSelect: (id: string) => void;
  /** Bloquea la edición (ej. seguros con tasa fija). */
  disabled?: boolean;
  /** Nota bajo el control cuando está bloqueado. */
  lockNote?: string;
  label?: string;
  className?: string;
  /** Moneda de las tasas listadas; la usa el alta rápida. Default: USD. */
  currency?: Currency;
  /**
   * Muestra el botón "+" para crear una tasa sin salir de la pantalla (seguros
   * y pagos que liquidan a la tasa del día con otros decimales).
   */
  allowCreate?: boolean;
  /** Aviso extra tras crear una tasa; ya queda seleccionada por el componente. */
  onCreated?: (rate: ExchangeRate) => void;
}

/**
 * Selector buscable de tasa USD con auto-selección de la más actual.
 * El menú se abre hacia arriba si no hay espacio abajo (colisión Radix).
 */
export function UsdRateSelect({
  rates,
  selectedId,
  currentRateId,
  onSelect,
  disabled,
  lockNote,
  label = 'Tasa USD aplicada',
  className,
  currency = 'USD',
  allowCreate = false,
  onCreated,
}: UsdRateSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { has } = usePermissions();
  const canCreate =
    allowCreate && !disabled && has(PERMISSIONS.EXCHANGE_RATES.CREATE);

  const selected = rates.find((r) => r.id === selectedId) ?? null;
  const display = selected
    ? `1 ${currency} = ${formatMoney(selected.amountBs)} Bs.`
    : '—';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rates;
    return rates.filter(
      (r) =>
        String(r.amountBs).toLowerCase().includes(term) ||
        r.effectiveDate.toLowerCase().includes(term),
    );
  }, [rates, search]);

  return (
    <div className={cn('rounded-md border p-2 bg-muted/30', className)}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {disabled ? (
        <>
          <div className="font-mono text-sm h-8 flex items-center px-1">{display}</div>
          {lockNote ? (
            <div className="text-[11px] text-muted-foreground">{lockNote}</div>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 min-w-0 justify-between font-mono h-8"
              >
                <span className="truncate">{display}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por monto o fecha…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 space-y-2 text-center">
                    <p className="text-xs text-muted-foreground">
                      Sin tasas {currency} disponibles.
                    </p>
                    {canCreate ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setOpen(false);
                          setCreateOpen(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Nueva tasa
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  filtered.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        onSelect(r.id);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'w-full text-left flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40',
                        r.id === selectedId && 'bg-muted/60',
                      )}
                    >
                      <span className="font-mono text-sm">
                        1 {currency} = {formatMoney(r.amountBs)} Bs.
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {r.effectiveDate.slice(0, 10)}
                        {r.id === currentRateId ? ' · actual' : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          {canCreate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              title={`Nueva tasa ${currency}/Bs`}
              aria-label={`Nueva tasa ${currency}/Bs`}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      )}
      {canCreate ? (
        <QuickExchangeRateModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          currency={currency}
          defaultAmountBs={selected ? Number(selected.amountBs) : undefined}
          defaultEffectiveDate={selected?.effectiveDate || undefined}
          onCreated={(rate) => {
            onSelect(rate.id);
            onCreated?.(rate);
          }}
        />
      ) : null}
    </div>
  );
}
