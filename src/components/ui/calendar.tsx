import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker';
import 'react-day-picker/style.css';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = DayPickerProps & {
  className?: string;
};

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
        month_caption: cn(defaults.month_caption, 'flex justify-center pt-1 relative items-center h-7'),
        caption_label: cn(defaults.caption_label, 'text-sm font-semibold'),
        nav: cn(defaults.nav, 'absolute inset-x-0 top-0 flex justify-between z-10 px-1'),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-7 w-7 p-0 opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-7 w-7 p-0 opacity-70 hover:opacity-100',
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
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className={cn('w-4 h-4', chevronClass)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}
