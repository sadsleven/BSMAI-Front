import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/money';
import {
  CustomNameSelect,
  SearchableSelect,
} from '@/modules/orders/presentation/components/ServiceProviderTable';
import {
  ProviderSearchSelect,
  providerSpecialties,
  type ProviderSelectValue,
} from '@/modules/orders/presentation/components/ProviderSearchSelect';
import { orderGateway } from '@/modules/orders/infrastructure/orderGateway';
import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import type { ProviderType } from '../../domain/models/budget';

export type BudgetServiceRowValue = {
  serviceTypeId: string;
  specialtyId?: string;
  customName?: string;
  quantity?: number;
  /** Precio unitario USD cotizado. Editable: es el que se imprime. */
  unitPriceUsd?: number;
  /** Precio de catálogo que se propuso. Sostiene el badge "ajustado". */
  catalogPriceUsd?: number;
  /** Proveedor tentativo. Opcional — al presupuestar suele no saberse. */
  providerType?: ProviderType | '';
  doctorId?: string;
  careCenterId?: string;
};

export type BudgetServiceRowErrors = {
  serviceTypeId?: string;
  specialtyId?: string;
  customName?: string;
  quantity?: string;
  unitPriceUsd?: string;
  providerType?: string;
  doctorId?: string;
  careCenterId?: string;
};

export type BudgetServiceTableProps = {
  value: BudgetServiceRowValue[];
  onChange: (next: BudgetServiceRowValue[]) => void;
  serviceTypes: ServiceType[];
  specialties: Specialty[];
  errors?: Array<BudgetServiceRowErrors | undefined>;
  disabled?: boolean;
  /** Precio unitario USD de catálogo por ST (baremo del seguro / Particular). */
  priceByServiceTypeId?: Map<string, number>;
  /** Con seguro elegido, sólo se ofrecen STs con baremo. */
  restrictToPriced?: boolean;
  /** Hidrata el chip de proveedor al editar. Clave `${type}:${id}`. */
  initialProviders?: Map<string, Doctor | CareCenter>;
};

function seedProviderValue(
  row: BudgetServiceRowValue,
  initial?: Map<string, Doctor | CareCenter>,
): ProviderSelectValue | null {
  if (!initial) return null;
  if (row.providerType === 'doctor' && row.doctorId) {
    const d = initial.get(`doctor:${row.doctorId}`) as Doctor | undefined;
    return d ? { providerType: 'doctor', doctor: d } : null;
  }
  if (row.providerType === 'care_center' && row.careCenterId) {
    const c = initial.get(`care_center:${row.careCenterId}`) as
      | CareCenter
      | undefined;
    return c ? { providerType: 'care_center', careCenter: c } : null;
  }
  return null;
}

/**
 * Tabla de servicios del presupuesto. Es la hermana de `ServiceProviderTable`
 * del Paso 1, con dos diferencias que vienen del negocio:
 *  - El PRECIO de cada línea es editable: el presupuesto congela lo que se
 *    cotizó, y cotizar un precio distinto al de catálogo es rutina (paquetes,
 *    convenios). Un badge marca la línea ajustada y se puede volver al de
 *    catálogo de un clic.
 *  - El PROVEEDOR es opcional: al presupuestar casi nunca se sabe quién
 *    atiende. Si se indica, viaja a la orden al convertir.
 */
export function BudgetServiceTable({
  value,
  onChange,
  serviceTypes,
  specialties,
  errors,
  disabled,
  priceByServiceTypeId,
  restrictToPriced,
  initialProviders,
}: BudgetServiceTableProps) {
  const optionLabel = (s: ServiceType): string => {
    const p = priceByServiceTypeId?.get(s.id);
    return p != null ? `${s.name} · $${formatMoney(p)}` : s.name;
  };

  const usedIds = useMemo(
    () => new Set(value.map((r) => r.serviceTypeId).filter(Boolean)),
    [value],
  );

  // Nombres ya usados para cada ST en órdenes previas: el presupuesto usa el
  // mismo vocabulario que la orden que saldrá de él.
  const [nameSuggestions, setNameSuggestions] = useState<
    Record<string, string[]>
  >({});
  useEffect(() => {
    const ids = Array.from(
      new Set(value.map((r) => r.serviceTypeId).filter(Boolean)),
    );
    const missing = ids.filter((id) => !(id in nameSuggestions));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        orderGateway
          .customNameSuggestions(id)
          .then((list) => [id, list] as const)
          .catch(() => [id, [] as string[]] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setNameSuggestions((prev) => {
        const next = { ...prev };
        for (const [id, list] of pairs) next[id] = list;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value, nameSuggestions]);

  const [providerCache, setProviderCache] = useState<
    Array<ProviderSelectValue | null>
  >(() => value.map((r) => seedProviderValue(r, initialProviders)));

  useEffect(() => {
    setProviderCache((prev) =>
      value.map((r, i) => {
        const cached = prev[i];
        if (
          cached &&
          ((r.providerType === 'doctor' &&
            cached.providerType === 'doctor' &&
            cached.doctor.id === r.doctorId) ||
            (r.providerType === 'care_center' &&
              cached.providerType === 'care_center' &&
              cached.careCenter.id === r.careCenterId))
        ) {
          return cached;
        }
        return seedProviderValue(r, initialProviders);
      }),
    );
  }, [value, initialProviders]);

  const updateRow = (idx: number, patch: Partial<BudgetServiceRowValue>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    onChange([
      ...value,
      {
        serviceTypeId: '',
        quantity: 1,
        // Un presupuesto suele ser de una especialidad: la fila nueva hereda
        // la de la anterior y sólo se cambia cuando de verdad difiere.
        specialtyId: value[value.length - 1]?.specialtyId,
        providerType: '',
      },
    ]);
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  /** Elegir ST: trae su precio de catálogo como precio cotizado inicial. */
  const setRowServiceType = (idx: number, serviceTypeId: string) => {
    const catalog = priceByServiceTypeId?.get(serviceTypeId);
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    updateRow(idx, {
      serviceTypeId,
      quantity: value[idx]?.quantity ?? 1,
      catalogPriceUsd: catalog,
      unitPriceUsd: catalog ?? 0,
      // Nombre por defecto = el del catálogo; el usuario puede cambiarlo.
      customName: value[idx]?.customName?.trim() || st?.name || '',
    });
  };

  const setRowProvider = (idx: number, pv: ProviderSelectValue | null) => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? pv : x)));
    if (!pv) {
      updateRow(idx, { doctorId: undefined, careCenterId: undefined });
      return;
    }
    const own = providerSpecialties(pv) ?? [];
    const inferred =
      !value[idx]?.specialtyId && own.length === 1 ? own[0].id : undefined;
    if (pv.providerType === 'doctor') {
      updateRow(idx, {
        providerType: 'doctor',
        doctorId: pv.doctor.id,
        careCenterId: undefined,
        ...(inferred ? { specialtyId: inferred } : {}),
      });
    } else {
      updateRow(idx, {
        providerType: 'care_center',
        careCenterId: pv.careCenter.id,
        doctorId: undefined,
        ...(inferred ? { specialtyId: inferred } : {}),
      });
    }
  };

  const setRowProviderType = (idx: number, pt: ProviderType | '') => {
    setProviderCache((prev) => prev.map((x, i) => (i === idx ? null : x)));
    updateRow(idx, {
      providerType: pt,
      doctorId: undefined,
      careCenterId: undefined,
    });
  };

  const setRowSpecialty = (idx: number, specialtyId: string) => {
    const current = providerCache[idx] ?? null;
    const keeps =
      !!current &&
      (providerSpecialties(current) ?? []).some((s) => s.id === specialtyId);
    if (!keeps) {
      setProviderCache((prev) => prev.map((x, i) => (i === idx ? null : x)));
      updateRow(idx, {
        specialtyId,
        doctorId: undefined,
        careCenterId: undefined,
      });
      return;
    }
    updateRow(idx, { specialtyId });
  };

  const total = useMemo(() => {
    const cents = value.reduce((acc, r) => {
      const qty = Math.max(1, Math.trunc(r.quantity ?? 1));
      return acc + Math.round((r.unitPriceUsd ?? 0) * 100) * qty;
    }, 0);
    return cents / 100;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          El precio de cada servicio se propone desde el catálogo y se puede
          ajustar: el presupuesto conserva lo cotizado. El proveedor es
          opcional.
        </p>
        {value.length > 0 && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Suma ${formatMoney(total)}
          </Badge>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay servicios. Agrega al menos uno.
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((row, idx) => {
            const rowError = errors?.[idx];
            const available = serviceTypes.filter(
              (s) =>
                (!usedIds.has(s.id) || s.id === row.serviceTypeId) &&
                (!restrictToPriced ||
                  priceByServiceTypeId?.has(s.id) ||
                  s.id === row.serviceTypeId),
            );
            const catalog = row.catalogPriceUsd;
            const adjusted =
              catalog != null &&
              row.unitPriceUsd != null &&
              Math.round(catalog * 100) !== Math.round(row.unitPriceUsd * 100);
            const qty = Math.max(1, Math.trunc(row.quantity ?? 1));
            const lineTotal = +((row.unitPriceUsd ?? 0) * qty).toFixed(2);

            return (
              <div key={idx} className="space-y-3 rounded-lg border bg-card p-3">
                {/* Servicio + nombre impreso */}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Tipo de Servicio
                    </label>
                    <SearchableSelect
                      value={row.serviceTypeId || ''}
                      options={available.map((s) => ({
                        id: s.id,
                        label: optionLabel(s),
                      }))}
                      onChange={(v) => setRowServiceType(idx, v)}
                      disabled={disabled}
                      invalid={!!rowError?.serviceTypeId}
                    />
                    {rowError?.serviceTypeId && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {rowError.serviceTypeId}
                      </p>
                    )}
                    <div className="space-y-1 pt-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Nombre en el presupuesto{' '}
                        <span className="text-destructive">*</span>
                      </label>
                      <CustomNameSelect
                        value={row.customName ?? ''}
                        suggestions={nameSuggestions[row.serviceTypeId] ?? []}
                        onChange={(name) => updateRow(idx, { customName: name })}
                        disabled={disabled || !row.serviceTypeId}
                        invalid={!!rowError?.customName}
                        placeholder={
                          row.serviceTypeId
                            ? 'Elige uno previo o escribe uno nuevo'
                            : 'Elige primero el Tipo de Servicio'
                        }
                      />
                      {rowError?.customName && (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {rowError.customName}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={disabled}
                    className="mt-[22px] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive disabled:opacity-40"
                    title="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Cantidad + precio unitario + total de la línea */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-24 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={row.quantity ?? 1}
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        updateRow(idx, {
                          quantity: Number.isFinite(n) && n >= 1 ? n : 1,
                        });
                      }}
                      disabled={disabled}
                      className={cn(
                        'h-9',
                        rowError?.quantity && 'border-destructive',
                      )}
                    />
                  </div>
                  <div className="w-36 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Precio unit. $
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.unitPriceUsd ?? ''}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateRow(idx, {
                          unitPriceUsd: Number.isFinite(n) && n >= 0 ? n : 0,
                        });
                      }}
                      disabled={disabled || !row.serviceTypeId}
                      className={cn(
                        'h-9',
                        rowError?.unitPriceUsd && 'border-destructive',
                      )}
                    />
                    {rowError?.unitPriceUsd && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {rowError.unitPriceUsd}
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-[150px] flex-1 flex-col gap-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Total línea
                    </label>
                    <div className="flex h-9 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        ${formatMoney(lineTotal)}
                      </span>
                      {adjusted && (
                        <>
                          <Badge variant="outline" className="text-[10px]">
                            Ajustado · catálogo ${formatMoney(catalog)}
                          </Badge>
                          <button
                            type="button"
                            onClick={() =>
                              updateRow(idx, { unitPriceUsd: catalog })
                            }
                            disabled={disabled}
                            title="Volver al precio de catálogo"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {catalog == null && row.serviceTypeId && (
                        <Badge variant="outline" className="text-[10px]">
                          Sin precio de catálogo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Especialidad + proveedor (ambos opcionales) */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[190px] flex-1 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Especialidad
                    </label>
                    <SearchableSelect
                      value={row.specialtyId ?? ''}
                      options={specialties.map((s) => ({
                        id: s.id,
                        label: s.name,
                      }))}
                      onChange={(id) => setRowSpecialty(idx, id)}
                      disabled={disabled}
                      invalid={!!rowError?.specialtyId}
                      placeholder="Opcional"
                      searchPlaceholder="Buscar especialidad…"
                      emptyLabel="Sin especialidades disponibles."
                    />
                  </div>
                  <div className="min-w-[260px] flex-[2] space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Proveedor (opcional)
                    </label>
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="inline-flex shrink-0 gap-0.5 rounded-md border p-0.5">
                        {(
                          [
                            ['', 'Sin asignar'],
                            ['doctor', 'Doctor'],
                            ['care_center', 'Centro'],
                          ] as Array<[ProviderType | '', string]>
                        ).map(([pt, label]) => (
                          <button
                            key={pt || 'none'}
                            type="button"
                            onClick={() => setRowProviderType(idx, pt)}
                            disabled={disabled}
                            className={cn(
                              'rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                              (row.providerType ?? '') === pt
                                ? 'bg-brand-blue-soft text-brand-blue-strong'
                                : 'text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {row.providerType ? (
                        <div className="min-w-[200px] flex-1">
                          <ProviderSearchSelect
                            providerType={row.providerType}
                            value={providerCache[idx] ?? null}
                            onChange={(pv) => setRowProvider(idx, pv)}
                            disabled={disabled}
                            hideLabel
                            compact
                            specialtyId={row.specialtyId || undefined}
                            error={rowError?.doctorId ?? rowError?.careCenterId}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Agregar servicio
      </Button>
    </div>
  );
}
