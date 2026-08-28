import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatCedula } from '@/lib/validations/ve-formats';
import { cn } from '@/lib/utils';

export type CedulaInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> & {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Habilita el prefijo `M` (menores de edad). Sólo pacientes. */
  allowMinor?: boolean;
};

/**
 * Input de cédula venezolana con auto-formato `V-XX.XXX.XXX`.
 * Acepta `V` o `E` como prefijo (y `M` con `allowMinor`, para menores de edad).
 * Limita a 8 dígitos numéricos.
 */
export const CedulaInput = React.forwardRef<HTMLInputElement, CedulaInputProps>(
  ({ value, onChange, invalid, allowMinor, className, placeholder, ...rest }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(formatCedula(e.target.value, { allowMinor }));
    };
    return (
      <Input
        ref={ref}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        spellCheck={false}
        value={value}
        onChange={handleChange}
        placeholder={placeholder ?? (allowMinor ? 'V-12.345.678 / M-12.345.678' : 'V-12.345.678')}
        className={cn(
          'h-9 uppercase tracking-wide font-mono',
          invalid && 'border-destructive focus-visible:ring-destructive/30',
          className,
        )}
        {...rest}
      />
    );
  },
);
CedulaInput.displayName = 'CedulaInput';
