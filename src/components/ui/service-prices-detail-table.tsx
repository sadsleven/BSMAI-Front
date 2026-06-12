import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import { formatMoney } from '@/lib/format/money';

export function ServicePricesDetailTable({ prices }: { prices: ServicePriceRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prices;
    return prices.filter((sp) =>
      (sp.serviceType?.name ?? sp.serviceTypeId).toLowerCase().includes(q),
    );
  }, [prices, query]);

  if (!prices.length) {
    return <p className="text-sm text-muted-foreground italic">Sin precios cargados.</p>;
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar tipo de servicio…"
          className="h-9 pl-9 bg-muted/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[oklch(0.985_0.003_250)] hover:bg-[oklch(0.985_0.003_250)]">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Tipo de servicio
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right w-40">
                Precio (USD)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sp, i) => (
                <TableRow
                  key={sp.id ?? `${sp.serviceTypeId}-${i}`}
                  className="hover:bg-[oklch(0.985_0.003_250)]"
                >
                  <TableCell className="py-2.5 px-4 text-sm">
                    {sp.serviceType?.name ?? sp.serviceTypeId}
                  </TableCell>
                  <TableCell className="py-2.5 px-4 text-right font-mono text-sm whitespace-nowrap">
                    $ {formatMoney(sp.priceUsd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
