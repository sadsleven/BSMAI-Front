import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import { taxUnitGateway } from '../../infrastructure/taxUnitGateway';
import type { TaxUnit } from '../../domain/models/taxUnit';

export interface TaxUnitSelectProps {
  /** UT seleccionada (id) o null/'' sin selección. */
  selectedId: string | null;
  onSelect: (taxUnit: TaxUnit) => void;
  /**
   * UT ya conocida por el caller (ej. la del lote): se muestra aunque no esté
   * en el listado (UT deshabilitada o borrada después de elegirla).
   */
  selectedFallback?: Pick<TaxUnit, 'id' | 'amountBs' | 'effectiveDate'> | null;
  disabled?: boolean;
  /** Nota bajo el control cuando está bloqueado. */
  lockNote?: string;
  label?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Selector buscable de Unidad Tributaria (activas, más reciente primero).
 * Marca la UT vigente al día de hoy con "· vigente".
 */
export function TaxUnitSelect({
  selectedId,
  onSelect,
  selectedFallback,
  disabled,
  lockNote,
  label = 'Unidad Tributaria',
  placeholder = 'Selecciona una UT…',
  className,
}: TaxUnitSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [units, setUnits] = useState<TaxUnit[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [res, current] = await Promise.all([
          taxUnitGateway.list({
            limit: 100,
            isActive: true,
            sortBy: 'effectiveDate',
            sortDir: 'DESC',
          }),
          taxUnitGateway.getCurrent().catch(() => null),
        ]);
        if (cancelled) return;
        setUnits(res.data);
        setCurrentId(current?.id ?? null);
      } catch {
        if (!cancelled) setUnits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected =
    units.find((u) => u.id === selectedId) ??
    (selectedFallback && selectedFallback.id === selectedId
      ? selectedFallback
      : null);
  const display = selected
    ? `1 UT = ${formatMoney(selected.amountBs)} Bs. · ${selected.effectiveDate.slice(0, 10)}`
    : loading
      ? 'Cargando…'
      : placeholder;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return units;
    return units.filter(
      (u) =>
        String(u.amountBs).toLowerCase().includes(term) ||
        u.effectiveDate.toLowerCase().includes(term),
    );
  }, [units, search]);

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
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Sin Unidades Tributarias disponibles.
                </p>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onSelect(u);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={cn(
                      'w-full text-left flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40',
                      u.id === selectedId && 'bg-muted/60',
                    )}
                  >
                    <span className="font-mono text-sm">
                      1 UT = {formatMoney(u.amountBs)} Bs.
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {u.effectiveDate.slice(0, 10)}
                      {u.id === currentId ? ' · vigente' : ''}
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
