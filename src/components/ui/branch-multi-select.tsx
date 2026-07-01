import { useEffect, useMemo, useState } from 'react';
import { Building } from 'lucide-react';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { branchGateway } from '@/modules/branches/infrastructure/branchGateway';
import type { Branch } from '@/modules/branches/domain/models/branch';

export type BranchMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing branches already attached (allow keeping disabled ones). */
  existing?: Branch[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de sucursales sobre <ChipMultiSelect>: consume
 * `GET /branches/assignable`. Stale → chip punteado quitable, no re-agregable.
 */
export function BranchMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: BranchMultiSelectProps) {
  const [assignable, setAssignable] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await branchGateway.listAssignable();
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
    () => assignable.map((b) => ({ id: b.id, label: b.name })),
    [assignable],
  );

  const labelFor = (b: Branch) => {
    if (b.deletedAt) return `${b.name} · papelera`;
    if (b.isActive === false) return `${b.name} · deshabilitada`;
    return b.name;
  };

  const staleItems = useMemo(
    () => (existing ?? []).map((b) => ({ id: b.id, label: labelFor(b) })),
    [existing],
  );

  return (
    <ChipMultiSelect
      label="Sucursales"
      icon={Building}
      value={value}
      onChange={onChange}
      options={options}
      staleItems={staleItems}
      loading={loading}
      disabled={disabled}
      error={error}
      searchPlaceholder="Buscar sucursal…"
      emptyLabel="No hay sucursales disponibles."
      counterSuffix={{ singular: 'seleccionada', plural: 'seleccionadas' }}
      staleHint="Algunas sucursales asignadas no están disponibles para nuevas asignaciones; puedes quitarlas pero no re-agregarlas."
    />
  );
}
