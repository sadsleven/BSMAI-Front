import { useEffect, useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { contractorGateway } from '@/modules/contractors/infrastructure/contractorGateway';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

export type ContractorMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing contractors already attached (allow keeping disabled ones). */
  existing?: Contractor[];
  error?: string;
  disabled?: boolean;
};

/**
 * Multi-select de contratistas sobre <ChipMultiSelect>: consume
 * `GET /contractors/assignable`. Stale → chip punteado quitable, no re-agregable.
 */
export function ContractorMultiSelect({
  value,
  onChange,
  existing,
  error,
  disabled,
}: ContractorMultiSelectProps) {
  const [assignable, setAssignable] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await contractorGateway.listAssignable();
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
    () => assignable.map((c) => ({ id: c.id, label: c.name })),
    [assignable],
  );

  const labelFor = (c: Contractor) => {
    if (c.deletedAt) return `${c.name} · papelera`;
    if (c.isActive === false) return `${c.name} · deshabilitado`;
    return c.name;
  };

  const staleItems = useMemo(
    () => (existing ?? []).map((c) => ({ id: c.id, label: labelFor(c) })),
    [existing],
  );

  return (
    <ChipMultiSelect
      label="Contratistas"
      icon={Briefcase}
      value={value}
      onChange={onChange}
      options={options}
      staleItems={staleItems}
      loading={loading}
      disabled={disabled}
      error={error}
      searchPlaceholder="Buscar contratista…"
      emptyLabel="No hay contratistas disponibles."
      counterSuffix={{ singular: 'seleccionado', plural: 'seleccionados' }}
      staleHint="Algunos contratistas asignados no están disponibles para nuevas asignaciones; podés quitarlos pero no re-agregarlos."
    />
  );
}
