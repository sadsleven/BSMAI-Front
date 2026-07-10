import { DatePicker } from '@/components/ui/date-picker';

export type DateRangeFilterProps = {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  fromLabel?: string;
  toLabel?: string;
};

/**
 * Par de pickers Desde/Hasta para toolbars de reportes. Labels inline (a la
 * izquierda de cada picker) para mantener la fila alineada con el resto de
 * los controles h-9 del `DataTableToolbar`.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  fromLabel = 'Desde',
  toLabel = 'Hasta',
}: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {fromLabel}
        </span>
        <div className="w-44">
          <DatePicker
            value={from}
            onChange={(v) => onChange(v, to)}
            placeholder="Cualquiera"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {toLabel}
        </span>
        <div className="w-44">
          <DatePicker
            value={to}
            onChange={(v) => onChange(from, v)}
            placeholder="Cualquiera"
          />
        </div>
      </div>
    </div>
  );
}
