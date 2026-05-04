import * as React from 'react';
import CurrencyInput from 'react-currency-input-field';
import { cn } from '@/lib/utils';

/**
 * Input para montos con formato venezolano (separador miles `.` y decimal `,`).
 * Externamente expone `number | undefined` con notación estándar (`1485.22`).
 * Implementado sobre `react-currency-input-field` para mejor manejo del cursor
 * y edición posicional. Prefijo de moneda configurable (`Bs.` por defecto).
 */
export type CurrencyAmountInputProps = {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  invalid?: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  /** Prefijo de moneda mostrado dentro del input. Default: `Bs.`. */
  currencyPrefix?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
};

export const CurrencyAmountInput = React.forwardRef<
  HTMLInputElement,
  CurrencyAmountInputProps
>(function CurrencyAmountInput(
  {
    value,
    onChange,
    className,
    invalid,
    onBlur,
    disabled,
    id,
    name,
    placeholder = '0,00',
    currencyPrefix = 'Bs.',
  },
  ref,
) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none z-10">
        {currencyPrefix}
      </span>
      <CurrencyInput
        ref={ref}
        id={id}
        name={name}
        placeholder={placeholder}
        value={value ?? ''}
        decimalsLimit={2}
        decimalScale={2}
        decimalSeparator=","
        groupSeparator="."
        allowNegativeValue={false}
        disableAbbreviations
        intlConfig={undefined}
        disabled={disabled}
        onValueChange={(_, __, values) => {
          if (!values || values.float === undefined || values.float === null) {
            onChange(undefined);
          } else {
            onChange(values.float);
          }
        }}
        onBlur={onBlur}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent pl-12 pr-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
      />
    </div>
  );
});
