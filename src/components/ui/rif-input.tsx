import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatRif } from '@/lib/validations/ve-formats';
import { cn } from '@/lib/utils';

export type RifInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> & {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
};

/**
 * Input de RIF venezolano con auto-formato `J-XX.XXX.XXX-D`.
 * Acepta `J/G/V/E` como prefijo. Limita a 9 dígitos (8 base + 1 verificador).
 */
export const RifInput = React.forwardRef<HTMLInputElement, RifInputProps>(
  ({ value, onChange, invalid, className, placeholder, ...rest }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(formatRif(e.target.value));
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
        placeholder={placeholder ?? 'J-12.345.678-9'}
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
RifInput.displayName = 'RifInput';
