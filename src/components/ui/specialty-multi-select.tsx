import { useEffect, useMemo, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { specialtyGateway } from '@/modules/specialties/infrastructure/specialtyGateway';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';

export type SpecialtyMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing specialties already attached (allow keeping disabled ones). */
  existing?: Specialty[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de especialidades sobre <ChipMultiSelect>: consume
 * `GET /specialties/assignable`. Chips fuera del selector (también
 * deseleccionables ahí). Stale → chip punteado quitable, no re-agregable.
 */
export function SpecialtyMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: SpecialtyMultiSelectProps) {
  const [assignable, setAssignable] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await specialtyGateway.listAssignable();
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
    () => assignable.map((s) => ({ id: s.id, label: s.name })),
    [assignable],
  );
  const staleItems = useMemo(
    () => (existing ?? []).map((s) => ({ id: s.id, label: s.name })),
    [existing],
  );

  return (
    <ChipMultiSelect
      label="Especialidades"
      icon={Stethoscope}
      required
      value={value}
      onChange={onChange}
      options={options}
      staleItems={staleItems}
      loading={loading}
      disabled={disabled}
      error={error}
      searchPlaceholder="Buscar especialidad…"
      emptyLabel="No hay especialidades disponibles."
      counterSuffix={{ singular: 'seleccionada', plural: 'seleccionadas' }}
      staleHint="Algunas especialidades asignadas no están disponibles para nuevas asignaciones; podés quitarlas pero no re-agregarlas."
    />
  );
}
