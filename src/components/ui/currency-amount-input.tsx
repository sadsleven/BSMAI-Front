import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Input para montos en bolívares con formato venezolano:
 * separador de miles `.` y decimal `,`. Ej: "1.485,22".
 *
 * Externamente expone un `number | undefined` con notación estándar
 * (`1485.22`). Reutilizable para cualquier módulo que maneje montos.
 */
export type CurrencyAmountInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  invalid?: boolean;
};

const ALLOWED = /[^\d,]/g;

function toVe(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '';
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parseVe(raw: string): number | undefined {
  const cleaned = raw.replace(ALLOWED, '');
  if (!cleaned) return undefined;
  // Treat first comma as decimal separator; ignore further commas.
  const [intPart, decPart = ''] = cleaned.split(',');
  const numStr = `${intPart || '0'}.${decPart.slice(0, 2)}`;
  const n = Number(numStr);
  return Number.isFinite(n) ? n : undefined;
}

export const CurrencyAmountInput = React.forwardRef<
  HTMLInputElement,
  CurrencyAmountInputProps
>(function CurrencyAmountInput(
  { value, onChange, className, invalid, onBlur, ...rest },
  ref,
) {
  const [display, setDisplay] = React.useState<string>(() => toVe(value));
  const lastEmittedRef = React.useRef<number | undefined>(value);

  // Sync external value -> display only when it differs from our last emit
  // (avoids hijacking the user's in-progress typing).
  React.useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setDisplay(toVe(value));
      lastEmittedRef.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(ALLOWED, '');
    // Allow only one comma
    const firstComma = raw.indexOf(',');
    if (firstComma !== -1) {
      raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, '');
    }
    // Cap decimals to 2
    if (firstComma !== -1) {
      const [i, d] = raw.split(',');
      raw = `${i},${d.slice(0, 2)}`;
    }
    setDisplay(raw);
    const n = parseVe(raw);
    lastEmittedRef.current = n;
    onChange(n);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const n = parseVe(display);
    if (n !== undefined) {
      const formatted = toVe(n);
      setDisplay(formatted);
      lastEmittedRef.current = n;
      onChange(n);
    } else {
      setDisplay('');
      lastEmittedRef.current = undefined;
      onChange(undefined);
    }
    onBlur?.(e);
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
        Bs.
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="0,00"
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent pl-10 pr-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
        {...rest}
      />
    </div>
  );
});
