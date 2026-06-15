import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Search, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { serviceTypeGateway } from '@/modules/service-types/infrastructure/serviceTypeGateway';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
/** A partir de cuántas filas aparecen búsqueda + paginado. */
const PAGINATE_THRESHOLD = PAGE_SIZE_OPTIONS[0];
/** Tope de opciones renderizadas en el combobox de ST (hay miles). */
const MAX_OPTIONS = 50;

/** Contador para claves estables de filas nuevas (sólo cliente). */
let rowKeySeq = 0;
const nextRowKey = () => `rk_${(rowKeySeq += 1)}`;

type RowError = { serviceTypeId?: string; priceUsd?: string };

export type ServicePricesTableProps = {
  value: ServicePriceRow[];
  onChange: (next: ServicePriceRow[]) => void;
  /** Errores por fila (mismo orden que `value`). */
  errors?: Array<RowError | undefined>;
  /** Texto descriptivo bajo el título. */
  description?: string;
  /** Mensaje cuando no hay filas. */
  emptyMessage?: string;
};

/**
 * Sub-tabla reutilizable de precios por Tipo de Servicio. Se usa en formularios
 * de Seguro, Doctor y Centro de Atención. Cada fila: ST + precio USD + eliminar.
 *
 * Rendimiento (catálogos de miles de STs y cientos de filas):
 * - Paginado: sólo se montan las filas de la página.
 * - Cada fila memoizada: editar/tipear sólo re-renderiza esa fila.
 * - Mapa de nombres construido una sola vez (depende del catálogo, no de `value`).
 * - Selector de ST con búsqueda y tope de opciones visibles (no monta miles).
 */
export function ServicePricesTable({
  value,
  onChange,
  errors,
  description,
  emptyMessage = 'Aún no hay Tipos de Servicio cargados. Agregá los servicios que aplican.',
}: ServicePricesTableProps) {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Refs para que los handlers sean referencialmente estables (no rompen el
  // `memo` de las filas) leyendo siempre el último `value`/`onChange`/`pageSize`.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const pageSizeRef = useRef(pageSize);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    pageSizeRef.current = pageSize;
  });

  useEffect(() => {
    let cancelled = false;
    serviceTypeGateway
      .listAssignable()
      .then((list) => {
        if (!cancelled) setServiceTypes(list);
      })
      .catch(() => !cancelled && setServiceTypes([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Mapa de nombres del catálogo: se construye UNA vez al cargar, no por tecla.
  const stNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of serviceTypes) m.set(s.id, s.name);
    return m;
  }, [serviceTypes]);

  // Nombre a mostrar de una fila: catálogo, o el `serviceType` eager del BE
  // (cubre STs stale ya no asignables).
  const nameOf = useCallback(
    (row: ServicePriceRow) =>
      stNameById.get(row.serviceTypeId) ?? row.serviceType?.name ?? '',
    [stNameById],
  );

  // Firma sólo de los serviceTypeId elegidos: estable mientras sólo cambian
  // precios, así `baseAvailable` no se recalcula al tipear y el `memo` aguanta.
  const usedSig = value.map((r) => r.serviceTypeId).join('|');
  const baseAvailable = useMemo(() => {
    const used = new Set(value.map((r) => r.serviceTypeId).filter(Boolean));
    return serviceTypes.filter((s) => !used.has(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypes, usedSig]);

  // Búsqueda + paginado sólo aparecen con suficientes filas.
  const paginates = value.length > PAGINATE_THRESHOLD;

  // Filas + índice absoluto, filtradas por búsqueda (nombre del ST). La búsqueda
  // se ignora si la barra no está visible (evita ocultar filas sin poder limpiar).
  const filtered = useMemo(() => {
    const items = value.map((row, index) => ({ row, index }));
    const q = paginates ? search.trim().toLowerCase() : '';
    if (!q) return items;
    return items.filter(({ row }) => nameOf(row).toLowerCase().includes(q));
  }, [value, search, nameOf, paginates]);

  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const updateRow = useCallback((idx: number, patch: Partial<ServicePriceRow>) => {
    const v = valueRef.current;
    onChangeRef.current(v.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((idx: number) => {
    const v = valueRef.current;
    onChangeRef.current(v.filter((_, i) => i !== idx));
  }, []);

  const addRow = useCallback(() => {
    const v = valueRef.current;
    onChangeRef.current([...v, { serviceTypeId: '', priceUsd: 0, _rk: nextRowKey() }]);
    // La fila nueva no coincide con la búsqueda: limpiala y saltá a su página.
    setSearch('');
    setPage(Math.max(1, Math.ceil((v.length + 1) / pageSizeRef.current)));
  }, []);

  return (
    <div className="space-y-3">
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <>
          {paginates ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar servicio…"
                  className="h-9 pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {total.toLocaleString()} de {value.length.toLocaleString()} servicios
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[oklch(0.985_0.003_250)]">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    Tipo de Servicio
                  </th>
                  <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground w-[180px]">
                    Precio USD
                  </th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr className="border-t">
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      Sin resultados para “{search}”.
                    </td>
                  </tr>
                ) : (
                  pageItems.map(({ row, index }) => (
                    <PriceRow
                      key={row.id ?? row._rk ?? index}
                      row={row}
                      index={index}
                      options={baseAvailable}
                      currentName={nameOf(row)}
                      loading={loading}
                      error={errors?.[index]}
                      onUpdate={updateRow}
                      onRemove={removeRow}
                    />
                  ))
                )}
              </tbody>
            </table>

            {paginates ? (
              <DataTablePagination
                page={safePage}
                pageSize={pageSize}
                total={total}
                lastPage={lastPage}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                itemLabel="servicios"
              />
            ) : null}
          </div>
        </>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Tipo de Servicio
      </Button>

      <Label className="sr-only">Precios por Tipo de Servicio</Label>
    </div>
  );
}

type PriceRowProps = {
  row: ServicePriceRow;
  /** Índice absoluto en el array completo (no en la página). */
  index: number;
  /** Servicios libres (sin los ya elegidos en otras filas). Ref estable. */
  options: ServiceType[];
  /** Nombre del ST actual (incluye stale ya no asignables). */
  currentName?: string;
  loading: boolean;
  error?: RowError;
  onUpdate: (index: number, patch: Partial<ServicePriceRow>) => void;
  onRemove: (index: number) => void;
};

const PriceRow = memo(function PriceRow({
  row,
  index,
  options,
  currentName,
  loading,
  error,
  onUpdate,
  onRemove,
}: PriceRowProps) {
  // El ST propio se excluye de `options` (está "usado"); reinyectalo para que
  // siga siendo opción seleccionable en su propia fila.
  const rowOptions = useMemo(() => {
    if (row.serviceTypeId && !options.some((o) => o.id === row.serviceTypeId)) {
      return [
        {
          id: row.serviceTypeId,
          name: currentName ?? '',
          isActive: false,
          particularPriceUsd: null,
        } as ServiceType,
        ...options,
      ];
    }
    return options;
  }, [options, row.serviceTypeId, currentName]);

  return (
    <tr className="border-t align-top">
      <td className="px-4 py-2">
        <ServiceTypeCombobox
          value={row.serviceTypeId}
          currentName={currentName}
          options={rowOptions}
          loading={loading}
          invalid={!!error?.serviceTypeId}
          onSelect={(id, name) =>
            onUpdate(index, { serviceTypeId: id, serviceType: { id, name } })
          }
        />
        {error?.serviceTypeId && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {error.serviceTypeId}
          </p>
        )}
      </td>
      <td className="px-4 py-2">
        <CurrencyAmountInput
          value={Number(row.priceUsd) || undefined}
          onChange={(v) => onUpdate(index, { priceUsd: v ?? 0 })}
          currencyPrefix="$"
          invalid={!!error?.priceUsd}
        />
        {error?.priceUsd && <p className="text-xs text-destructive mt-1">{error.priceUsd}</p>}
      </td>
      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors"
          title="Quitar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

type ServiceTypeComboboxProps = {
  value: string;
  currentName?: string;
  options: ServiceType[];
  loading: boolean;
  invalid?: boolean;
  onSelect: (id: string, name: string) => void;
};

/**
 * Selector de Tipo de Servicio con búsqueda. Filtra el catálogo (miles) en
 * cliente y renderiza como máximo `MAX_OPTIONS` ítems para no colgar el DOM.
 * El popup sólo monta su contenido al abrirse (Radix Portal).
 */
function ServiceTypeCombobox({
  value,
  currentName,
  options,
  loading,
  invalid,
  onSelect,
}: ServiceTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { items, overflow } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
    return {
      items: matched.slice(0, MAX_OPTIONS),
      overflow: Math.max(0, matched.length - MAX_OPTIONS),
    };
  }, [query, options]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            invalid && 'border-destructive',
          )}
        >
          <span className={cn('truncate', !currentName && 'text-muted-foreground')}>
            {currentName || (loading ? 'Cargando…' : 'Seleccioná un servicio')}
          </span>
          <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar servicio…"
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {loading ? 'Cargando…' : 'Sin resultados.'}
            </div>
          ) : (
            items.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o.id, o.name);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted',
                  o.id === value && 'bg-muted/60 font-medium',
                )}
              >
                <Check
                  className={cn(
                    'w-4 h-4 shrink-0',
                    o.id === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{o.name}</span>
              </button>
            ))
          )}
          {overflow > 0 && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">
              +{overflow.toLocaleString()} más. Refiná la búsqueda.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Filtra filas con serviceTypeId vacío y serializa a payload BE. */
export function servicePricesToPayload(rows: ServicePriceRow[]) {
  return rows
    .filter((r) => r.serviceTypeId)
    .map((r) => ({
      serviceTypeId: r.serviceTypeId,
      priceUsd: Number(r.priceUsd) || 0,
    }));
}
