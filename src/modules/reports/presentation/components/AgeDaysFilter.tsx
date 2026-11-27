import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type AgeDaysFilterProps = {
  /** Días mínimos de antigüedad seleccionados ('' = sin filtro). */
  value?: string;
  onChange: (value: string | undefined) => void;
  width?: string;
};

/**
 * Filtro de antigüedad: muestra sólo los registros creados hace N días o más.
 * Intervalos de 10 en 10, desde 10 (mínimo) hasta 180 o más.
 * - Cuentas por cobrar: fecha de la factura; sin factura (Cashea/crédito con
 *   factura opcional), la fecha de creación de la orden.
 * - Cuentas por pagar: fecha de creación de la orden.
 */
const OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);

export function AgeDaysFilter({
  value,
  onChange,
  width = 'w-48',
}: AgeDaysFilterProps) {
  return (
    <Select
      value={value || 'all'}
      onValueChange={(v) => onChange(v === 'all' ? undefined : v)}
    >
      <SelectTrigger className={`h-9 ${width}`}>
        <SelectValue placeholder="Antigüedad" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Antigüedad: todas</SelectItem>
        {OPTIONS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {d >= 180 ? '180 días o más' : `${d} días o más`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
