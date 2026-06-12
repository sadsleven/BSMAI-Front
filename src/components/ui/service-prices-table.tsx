import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { serviceTypeGateway } from '@/modules/service-types/infrastructure/serviceTypeGateway';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import { cn } from '@/lib/utils';

export type ServicePricesTableProps = {
  value: ServicePriceRow[];
  onChange: (next: ServicePriceRow[]) => void;
  /** Errores por fila (mismo orden que `value`). */
  errors?: Array<{
    serviceTypeId?: string;
    priceUsd?: string;
  }>;
  /** Texto descriptivo bajo el título. */
  description?: string;
  /** Mensaje cuando no hay filas. */
  emptyMessage?: string;
};

/**
 * Sub-tabla reutilizable de precios por Tipo de Servicio. Se usa en formularios
 * de Seguro, Doctor y Centro de Atención. Cada fila: ST + precio USD + eliminar.
 * Botón "+ Agregar" añade fila vacía; el selector de ST excluye los ya elegidos
 * en la propia tabla.
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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

  const stById = useMemo(() => {
    const m = new Map<string, ServiceType>();
    for (const s of serviceTypes) m.set(s.id, s);
    // Incluye STs ya seleccionados aunque ya no sean asignables (stale).
    for (const row of value) {
      if (row.serviceType && !m.has(row.serviceTypeId)) {
        m.set(row.serviceTypeId, {
          id: row.serviceType.id,
          name: row.serviceType.name,
          isActive: false,
          particularPriceUsd: null,
        });
      }
    }
    return m;
  }, [serviceTypes, value]);

  const usedIds = useMemo(() => new Set(value.map((r) => r.serviceTypeId).filter(Boolean)), [value]);

  const addRow = () => {
    onChange([...value, { serviceTypeId: '', priceUsd: 0 }]);
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<ServicePriceRow>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

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
              {value.map((row, idx) => {
                const rowError = errors?.[idx];
                const available = serviceTypes.filter(
                  (s) => !usedIds.has(s.id) || s.id === row.serviceTypeId,
                );
                const currentST = stById.get(row.serviceTypeId);
                return (
                  <tr key={idx} className="border-t align-top">
                    <td className="px-4 py-2">
                      <Select
                        value={row.serviceTypeId || ''}
                        onValueChange={(v) =>
                          updateRow(idx, {
                            serviceTypeId: v,
                            serviceType: stById.get(v)
                              ? { id: v, name: stById.get(v)!.name }
                              : undefined,
                          })
                        }
                      >
                        <SelectTrigger
                          className={cn('h-9', rowError?.serviceTypeId && 'border-destructive')}
                        >
                          <SelectValue
                            placeholder={
                              loading ? 'Cargando…' : 'Seleccioná un servicio'
                            }
                          >
                            {currentST?.name ?? ''}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {available.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              Sin más servicios disponibles.
                            </div>
                          ) : (
                            available.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {rowError?.serviceTypeId && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {rowError.serviceTypeId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <CurrencyAmountInput
                        value={Number(row.priceUsd) || undefined}
                        onChange={(v) => updateRow(idx, { priceUsd: v ?? 0 })}
                        currencyPrefix="$"
                        invalid={!!rowError?.priceUsd}
                      />
                      {rowError?.priceUsd && (
                        <p className="text-xs text-destructive mt-1">{rowError.priceUsd}</p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors"
                        title="Quitar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Tipo de Servicio
      </Button>

      <Label className="sr-only">Precios por Tipo de Servicio</Label>
    </div>
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
