import { Switch } from '@/components/ui/switch';

export type ToggleFilterProps = {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * Interruptor con forma de control de filtro (alto h-9, borde y fondo de
 * tarjeta) para que viva en la fila de filtros junto a los `Select` en vez de
 * quedar suelto al lado de los botones de acción.
 */
export function ToggleFilter({ id, label, checked, onCheckedChange }: ToggleFilterProps) {
  return (
    <label
      htmlFor={id}
      className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground has-[[data-state=checked]]:border-primary/30 has-[[data-state=checked]]:text-foreground"
    >
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      {label}
    </label>
  );
}
