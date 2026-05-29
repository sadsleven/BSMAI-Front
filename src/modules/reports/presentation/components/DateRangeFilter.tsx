import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';

export type DateRangeFilterProps = {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  fromLabel?: string;
  toLabel?: string;
};

export function DateRangeFilter({
  from,
  to,
  onChange,
  fromLabel = 'Desde',
  toLabel = 'Hasta',
}: DateRangeFilterProps) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {fromLabel}
        </Label>
        <div className="w-48">
          <DatePicker
            value={from}
            onChange={(v) => onChange(v, to)}
            placeholder="Cualquiera"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {toLabel}
        </Label>
        <div className="w-48">
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
