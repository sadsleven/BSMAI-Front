import { useEffect, useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';

export type InsuranceMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing insurances already attached (allow keeping disabled ones). */
  existing?: Insurance[];
  error?: string;
  disabled?: boolean;
  /**
   * IDs deshabilitados con motivo. Aparecen visibles pero no clickeables;
   * el tooltip muestra la razón. Si ya están seleccionados, se muestran como
   * stale (quitables, no re-agregables).
   */
  disabledOptions?: Map<string, string>;
  /** Texto cabecera (default: "Seguros"). */
  label?: string;
};

/**
 * Multi-select de seguros sobre <ChipMultiSelect>: consume
 * `GET /insurances/assignable`. Stale → chip punteado quitable, no re-agregable.
 */
export function InsuranceMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
  disabledOptions,
  label,
}: InsuranceMultiSelectProps) {
  const [assignable, setAssignable] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await insuranceGateway.listAssignable();
        if (!cancelled) setAssignable(list);
      } catch {
        if (!cancelled) setAssignable([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () =>
      assignable.map((s) => ({
        id: s.id,
        label: s.name,
        disabledReason: disabledOptions?.get(s.id),
      })),
    [assignable, disabledOptions],
  );

  const labelFor = (s: Insurance) => {
    if (s.deletedAt) return `${s.name} · papelera`;
    if (s.isActive === false) return `${s.name} · deshabilitado`;
    return s.name;
  };

  const staleItems = useMemo(
    () => (existing ?? []).map((s) => ({ id: s.id, label: labelFor(s) })),
    [existing],
  );

  return (
    <ChipMultiSelect
      label={label ?? 'Seguros'}
      icon={Shield}
      value={value}
      onChange={onChange}
      options={options}
      staleItems={staleItems}
      loading={loading}
      disabled={disabled}
      error={error}
      searchPlaceholder="Buscar seguro…"
      emptyLabel="No hay seguros disponibles."
      counterSuffix={{ singular: 'seleccionado', plural: 'seleccionados' }}
      staleHint="Algunos seguros asignados no están disponibles para nuevas asignaciones; podés quitarlos pero no re-agregarlos."
    />
  );
}
