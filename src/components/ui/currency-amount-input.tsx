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
  readOnly?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  /** Prefijo de moneda mostrado dentro del input. Default: `Bs.`. */
  currencyPrefix?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
};

/** Número JS → string crudo con coma decimal (`5441.6` → `"5441,6"`). Vacío para nullish. */
function numberToRaw(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return String(value).replace('.', ',');
}

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
    readOnly,
    id,
    name,
    placeholder = '0,00',
    currencyPrefix = 'Bs.',
  },
  ref,
) {
  // El input se controla con el string crudo que el usuario tipea, NO con el
  // float reformateado. Controlarlo desde el número borra la coma y los ceros
  // finales en pleno tipeo (el prop number→string pierde `5441,` y `5441,60`).
  const [display, setDisplay] = React.useState<string>(() => numberToRaw(value));
  const lastEmitted = React.useRef<number | undefined>(value);

  // Sincroniza cambios programáticos del valor (prefill auto-pricing, reset).
  // Ignora los ecos de nuestro propio onChange para no pisar el tipeo.
  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setDisplay(numberToRaw(value));
    }
  }, [value]);

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
        value={display}
        decimalsLimit={2}
        decimalScale={2}
        decimalSeparator=","
        groupSeparator="."
        allowNegativeValue={false}
        disableAbbreviations
        intlConfig={undefined}
        disabled={disabled}
        readOnly={readOnly}
        onValueChange={(raw, _, values) => {
          setDisplay(raw ?? '');
          const next =
            values && values.float !== undefined && values.float !== null
              ? values.float
              : undefined;
          lastEmitted.current = next;
          onChange(next);
        }}
        onBlur={onBlur}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent pl-12 pr-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'read-only:bg-muted/30 read-only:cursor-default',
          invalid && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
      />
    </div>
  );
});
