import { useEffect, useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';
import { ContractorCreateModal } from '@/modules/contractors/presentation/components/ContractorCreateModal';
import { contractorGateway } from '@/modules/contractors/infrastructure/contractorGateway';
import type { Contractor } from '@/modules/contractors/domain/models/contractor';

export type ContractorMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pre-existing contractors already attached (allow keeping disabled ones). */
  existing?: Contractor[];
  error?: string;
  disabled?: boolean;
  /** Habilita "+ Crear contratista" inline (modal embebido). */
  allowCreate?: boolean;
  /**
   * Notifica al padre el contratista recién creado, para que refresque
   * resúmenes derivados (p.ej. seguros aportados por contratistas).
   */
  onCreated?: (contractor: Contractor) => void;
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
  allowCreate,
  onCreated,
}: ContractorMultiSelectProps) {
  const [assignable, setAssignable] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreated = (c: Contractor) => {
    setAssignable((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
    if (!value.includes(c.id)) onChange([...value, c.id]);
    onCreated?.(c);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await contractorGateway.listAssignable();
        // Merge, no overwrite: si el usuario creó un contratista vía "+ Crear"
        // antes de que esta carga inicial resolviera, su entrada local debe
        // sobrevivir (de lo contrario su chip seleccionado desaparece).
        if (!cancelled)
          setAssignable((prev) => {
            const ids = new Set(list.map((c) => c.id));
            const localOnly = prev.filter((c) => !ids.has(c.id));
            return [...localOnly, ...list];
          });
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
    <>
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
        staleHint="Algunos contratistas asignados no están disponibles para nuevas asignaciones; puedes quitarlos pero no re-agregarlos."
        onCreateNew={allowCreate ? () => setCreateOpen(true) : undefined}
        createLabel="Crear contratista"
      />
      {allowCreate ? (
        <ContractorCreateModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={handleCreated}
        />
      ) : null}
    </>
  );
}
