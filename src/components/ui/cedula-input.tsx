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
};

/**
 * Input de cédula venezolana con auto-formato `V-XX.XXX.XXX`.
 * Acepta `V` o `E` como prefijo. Limita a 8 dígitos numéricos.
 */
export const CedulaInput = React.forwardRef<HTMLInputElement, CedulaInputProps>(
  ({ value, onChange, invalid, className, placeholder, ...rest }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(formatCedula(e.target.value));
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
        placeholder={placeholder ?? 'V-12.345.678'}
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
