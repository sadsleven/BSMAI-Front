import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import {
  DayPicker,
  getDefaultClassNames,
  type DayPickerProps,
  type DropdownProps,
} from 'react-day-picker';
import 'react-day-picker/style.css';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CalendarProps = DayPickerProps & {
  className?: string;
};

/**
 * Custom dropdown for month/year that uses the shadcn `<Select>` instead of
 * the native `<select>`. Keeps caption layout consistent with the rest of the form UI.
 */
function CalendarDropdown({ value, onChange, options }: DropdownProps) {
  const handleChange = (next: string) => {
    if (!onChange) return;
    const event = {
      target: { value: next },
      currentTarget: { value: next },
    } as unknown as React.ChangeEvent<HTMLSelectElement>;
    onChange(event);
  };

  return (
    <Select value={value !== undefined ? String(value) : undefined} onValueChange={handleChange}>
      <SelectTrigger
        size="sm"
        className="h-8 w-auto min-w-[5rem] gap-1 px-2 text-sm font-medium capitalize"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options?.map((o) => (
          <SelectItem
            key={o.value}
            value={String(o.value)}
            disabled={o.disabled}
            className="capitalize"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Shadcn-styled Calendar built on react-day-picker v9. Default locale `es`.
 * Use inside `<Popover>` for date pickers.
 */
export function Calendar({ className, classNames, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      locale={es}
      showOutsideDays
      animate
      className={cn('p-3', className)}
      classNames={{
        ...defaults,
        root: cn(defaults.root, 'group/calendar w-fit'),
        months: cn(defaults.months, 'flex flex-col gap-4 sm:flex-row sm:gap-4 relative'),
        month: cn(defaults.month, 'flex flex-col gap-3'),
        month_caption: cn(
          defaults.month_caption,
          'flex justify-center pt-1 pb-1 relative items-center h-9 mb-1',
        ),
        caption_label: cn(defaults.caption_label, 'sr-only'),
        dropdowns: cn(
          defaults.dropdowns,
          'flex items-center gap-1.5 justify-center w-full',
        ),
        dropdown_root: cn(defaults.dropdown_root, 'inline-flex items-center'),
        dropdown: cn(defaults.dropdown, ''),
        nav: cn(
          defaults.nav,
          'absolute inset-x-0 top-0 flex justify-between z-10 px-1 pt-1 pointer-events-none',
        ),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-7 w-7 p-0 opacity-70 hover:opacity-100 pointer-events-auto',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-7 w-7 p-0 opacity-70 hover:opacity-100 pointer-events-auto',
        ),
        month_grid: cn(defaults.month_grid, 'w-full border-collapse'),
        weekdays: cn(defaults.weekdays, 'flex'),
        weekday: cn(
          defaults.weekday,
          'text-muted-foreground rounded-md w-9 font-medium text-[11px] uppercase tracking-wide',
        ),
        week: cn(defaults.week, 'flex w-full mt-1'),
        day: cn(
          defaults.day,
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        ),
        selected: cn(
          defaults.selected,
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground',
        ),
        today: cn(defaults.today, '[&>button]:bg-accent [&>button]:text-accent-foreground'),
        outside: cn(defaults.outside, 'text-muted-foreground/50 aria-selected:text-muted-foreground'),
        disabled: cn(defaults.disabled, 'text-muted-foreground/50 opacity-50'),
        hidden: cn(defaults.hidden, 'invisible'),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) => {
          const Icon =
            orientation === 'left'
              ? ChevronLeft
              : orientation === 'right'
                ? ChevronRight
                : orientation === 'up'
                  ? ChevronUp
                  : ChevronDown;
          return <Icon className={cn('w-4 h-4', chevronClass)} {...rest} />;
        },
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  );
}
