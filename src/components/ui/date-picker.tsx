import * as React from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export type DatePickerProps = {
  /** ISO date string `YYYY-MM-DD`, or empty/undefined for unset. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  /** Lower bound for selectable dates. Default: 1900-01-01. */
  fromYear?: number;
  /** Upper bound for selectable dates. Default: current year + 5. */
  toYear?: number;
};

function parseIsoDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  // Accept `YYYY-MM-DD` and full ISO. Use noon to avoid TZ rollover edge cases.
  const dateOnly = v.length >= 10 ? v.slice(0, 10) : v;
  const d = parse(`${dateOnly} 12:00:00`, 'yyyy-MM-dd HH:mm:ss', new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIsoDate(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Date-only picker. Output: `YYYY-MM-DD` string.
 * Mejor UX que `<input type="date">` — caption con dropdowns mes/año, locale es.
 */
export function DatePicker({
  value,
  onChange,
  onBlur,
  id,
  placeholder = 'Seleccioná una fecha',
  invalid,
  disabled,
  className,
  fromYear = 1900,
  toYear,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseIsoDate(value);
  const endYear = toYear ?? new Date().getFullYear() + 5;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive focus-visible:ring-destructive/30',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {selected ? format(selected, "d 'de' MMMM 'de' yyyy", { locale: es }) : placeholder}
          </span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(toIsoDate(d));
            setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date(endYear, 11)}
          defaultMonth={selected ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
