import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ProviderSearchSelect, type ProviderSelectValue } from './ProviderSearchSelect';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';

export type ServiceProviderRowValue = {
  serviceTypeId: string;
  providerType: 'doctor' | 'care_center';
  doctorId?: string;
  careCenterId?: string;
};

export type ServiceProviderRowErrors = {
  serviceTypeId?: string;
  providerType?: string;
  doctorId?: string;
  careCenterId?: string;
};

export type ServiceProviderTableProps = {
  value: ServiceProviderRowValue[];
  onChange: (next: ServiceProviderRowValue[]) => void;
  serviceTypes: ServiceType[];
  /** Errores Zod por fila. */
  errors?: Array<ServiceProviderRowErrors | undefined>;
  /** Hidrata el chip de proveedor en modo edición. Map key `${type}:${id}`. */
  initialProviders?: Map<string, Doctor | CareCenter>;
  disabled?: boolean;
};

/**
 * Tabla de filas Tipo de Servicio + Proveedor para el Paso 1 de Órdenes.
 * Cada fila independiente: cambia ST/proveedor sin afectar las demás.
 * Selector de ST excluye los ya elegidos.
 */
export function ServiceProviderTable({
  value,
  onChange,
  serviceTypes,
  errors,
  initialProviders,
  disabled,
}: ServiceProviderTableProps) {
  const stById = useMemo(() => {
    const m = new Map<string, ServiceType>();
    for (const s of serviceTypes) m.set(s.id, s);
    return m;
  }, [serviceTypes]);

  const usedIds = useMemo(
    () => new Set(value.map((r) => r.serviceTypeId).filter(Boolean)),
    [value],
  );

  // Cache per-row del objeto provider para mostrar chip en ProviderSearchSelect.
  // Las filas se identifican por índice; al agregar/quitar reordenamos el cache.
  const [providerCache, setProviderCache] = useState<Array<ProviderSelectValue | null>>(
    () =>
      value.map((r) => seedProviderValue(r, initialProviders)),
  );

  // Re-seed si initialProviders cambia (load tardío) o size de filas cambia externamente.
  useEffect(() => {
    setProviderCache((prev) => {
      const next = value.map((r, i) => {
        const cached = prev[i];
        if (cached) {
          // Si el ID ya no coincide, descartar.
          if (
            (r.providerType === 'doctor' && cached.providerType === 'doctor' && cached.doctor.id === r.doctorId) ||
            (r.providerType === 'care_center' && cached.providerType === 'care_center' && cached.careCenter.id === r.careCenterId)
          ) {
            return cached;
          }
        }
        return seedProviderValue(r, initialProviders);
      });
      return next;
    });
  }, [value, initialProviders]);

  const addRow = () => {
    onChange([
      ...value,
      { serviceTypeId: '', providerType: 'doctor' },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<ServiceProviderRowValue>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const setRowProvider = (idx: number, pv: ProviderSelectValue | null) => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? pv : x)));
    if (!pv) {
      updateRow(idx, { doctorId: undefined, careCenterId: undefined });
      return;
    }
    if (pv.providerType === 'doctor') {
      updateRow(idx, {
        providerType: 'doctor',
        doctorId: pv.doctor.id,
        careCenterId: undefined,
      });
    } else {
      updateRow(idx, {
        providerType: 'care_center',
        careCenterId: pv.careCenter.id,
        doctorId: undefined,
      });
    }
  };

  const setRowProviderType = (idx: number, pt: 'doctor' | 'care_center') => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? null : x)));
    updateRow(idx, {
      providerType: pt,
      doctorId: undefined,
      careCenterId: undefined,
    });
  };

  const distinctProviders = useMemo(() => {
    const set = new Set<string>();
    for (const r of value) {
      const id = r.providerType === 'doctor' ? r.doctorId : r.careCenterId;
      if (id) set.add(`${r.providerType}:${id}`);
    }
    return set.size;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Cada Tipo de Servicio tiene su propio proveedor. Cambiar uno no afecta a los demás.
        </p>
        {distinctProviders > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {distinctProviders} proveedor{distinctProviders === 1 ? '' : 'es'}
          </Badge>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay Tipos de Servicio. Agregá al menos uno.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-[oklch(0.985_0.003_250)]">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground w-[34%]">
                  Tipo de Servicio
                </th>
                <th className="px-4 py-2 font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Proveedor
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
                const currentST = row.serviceTypeId ? stById.get(row.serviceTypeId) : null;
                const cachedProvider = providerCache[idx] ?? null;
                return (
                  <tr key={idx} className="border-t align-top">
                    <td className="px-4 py-3">
                      <Select
                        value={row.serviceTypeId || ''}
                        onValueChange={(v) =>
                          updateRow(idx, { serviceTypeId: v })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger
                          className={cn('h-9', rowError?.serviceTypeId && 'border-destructive')}
                        >
                          <SelectValue placeholder="Seleccioná un servicio">
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
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="inline-flex rounded-md border p-0.5 gap-0.5">
                          {(['doctor', 'care_center'] as const).map((pt) => (
                            <button
                              key={pt}
                              type="button"
                              onClick={() => setRowProviderType(idx, pt)}
                              disabled={disabled}
                              className={cn(
                                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                                row.providerType === pt
                                  ? 'bg-brand-blue-soft text-brand-blue-strong'
                                  : 'text-muted-foreground hover:bg-accent',
                              )}
                            >
                              {pt === 'doctor' ? 'Doctor' : 'Centro'}
                            </button>
                          ))}
                        </div>
                        <ProviderSearchSelect
                          providerType={row.providerType}
                          value={cachedProvider}
                          onChange={(pv) => setRowProvider(idx, pv)}
                          disabled={disabled}
                          hideLabel
                          compact
                          error={rowError?.doctorId ?? rowError?.careCenterId}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={disabled}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-40"
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Tipo de Servicio
      </Button>
    </div>
  );
}

function seedProviderValue(
  row: ServiceProviderRowValue,
  initialProviders?: Map<string, Doctor | CareCenter>,
): ProviderSelectValue | null {
  if (!initialProviders) return null;
  if (row.providerType === 'doctor' && row.doctorId) {
    const obj = initialProviders.get(`doctor:${row.doctorId}`);
    if (obj && 'firstName' in obj) {
      return { providerType: 'doctor', doctor: obj as Doctor };
    }
  }
  if (row.providerType === 'care_center' && row.careCenterId) {
    const obj = initialProviders.get(`care_center:${row.careCenterId}`);
    if (obj && 'businessName' in obj) {
      return { providerType: 'care_center', careCenter: obj as CareCenter };
    }
  }
  return null;
}
