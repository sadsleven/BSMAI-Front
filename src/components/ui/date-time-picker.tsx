import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type DateTimePickerProps = {
  /** ISO 8601 datetime string. Treated as local time when no offset present. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  fromYear?: number;
  toYear?: number;
  /** Disable any datetime strictly after now. Caps `toYear` at current year. */
  disableFuture?: boolean;
};

function parseValue(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  try {
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Build local ISO string `YYYY-MM-DDTHH:mm:ss` (no TZ). Backend interprets as local. */
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/**
 * DateTime picker: Calendar + time input. ISO 8601 in/out (local time).
 * Útil para tasas de cambio donde la hora importa.
 */
export function DateTimePicker({
  value,
  onChange,
  onBlur,
  id,
  placeholder = 'Selecciona fecha y hora',
  invalid,
  disabled,
  className,
  fromYear = 1900,
  toYear,
  disableFuture = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const current = parseValue(value);
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const endYear = toYear ?? (disableFuture ? today.getFullYear() : today.getFullYear() + 5);

  const timeValue = current ? `${pad(current.getHours())}:${pad(current.getMinutes())}` : '';

  const clampToNow = (d: Date): Date => {
    if (!disableFuture) return d;
    const now = new Date();
    return d.getTime() > now.getTime() ? now : d;
  };

  const setDate = (d: Date | undefined) => {
    if (!d) {
      onChange(undefined);
      return;
    }
    const hours = current ? current.getHours() : 0;
    const minutes = current ? current.getMinutes() : 0;
    const next = new Date(d);
    next.setHours(hours, minutes, 0, 0);
    onChange(toLocalIso(clampToNow(next)));
  };

  const setTime = (raw: string) => {
    const [hStr, mStr] = raw.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const base = current ? new Date(current) : new Date();
    base.setHours(h, m, 0, 0);
    onChange(toLocalIso(clampToNow(base)));
  };

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
            !current && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {current
              ? format(current, "d 'de' MMMM yyyy, HH:mm", { locale: es })
              : placeholder}
          </span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={current}
          onSelect={setDate}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date(endYear, 11)}
          defaultMonth={current ?? new Date()}
          disabled={disableFuture ? { after: today } : undefined}
        />
        <div className="border-t p-3 space-y-1.5">
          <Label htmlFor={`${id ?? 'datetime'}-time`} className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            Hora
          </Label>
          <Input
            id={`${id ?? 'datetime'}-time`}
            type="time"
            value={timeValue}
            onChange={(e) => setTime(e.target.value)}
            className="h-9"
            step={60}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
