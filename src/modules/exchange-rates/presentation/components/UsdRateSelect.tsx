import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import type { ExchangeRate } from '../../domain/models/exchangeRate';

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
}: UsdRateSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = rates.find((r) => r.id === selectedId) ?? null;
  const display = selected ? `1 USD = ${formatMoney(selected.amountBs)} Bs.` : '—';

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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between font-mono h-8"
            >
              <span>{display}</span>
              <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
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
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Sin tasas USD disponibles.
                </p>
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
                      1 USD = {formatMoney(r.amountBs)} Bs.
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
      )}
    </div>
  );
}
