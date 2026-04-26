import * as React from 'react';

import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FormSwitchProps {
  id?: string;
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
  error?: string;
  className?: string;
}

let counter = 0;
const nextId = () => `form-switch-${++counter}`;

export function FormSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  tooltip,
  error,
  className,
}: FormSwitchProps) {
  const internalId = React.useMemo(() => id ?? nextId(), [id]);

  const control = (
    <Switch
      id={internalId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    />
  );

  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="space-y-1">
        <label
          htmlFor={internalId}
          className={cn(
            'text-sm font-medium leading-none',
            disabled ? 'text-muted-foreground' : '',
          )}
        >
          {label}
        </label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{control}</span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        control
      )}
    </div>
  );
}
