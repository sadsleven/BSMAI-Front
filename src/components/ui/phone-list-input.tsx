import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatPhoneDigits,
  PHONE_REGEX,
  type PhoneItemValue,
} from '@/lib/validations/ve-formats';
import { cn } from '@/lib/utils';

export type PhoneListInputProps = {
  value: PhoneItemValue[];
  onChange: (next: PhoneItemValue[]) => void;
  /** Optional per-item error messages (parallel array). */
  errors?: Array<{ number?: string; label?: string } | undefined>;
  /** Top-level array error (e.g. "Mínimo 1 teléfono"). */
  arrayError?: string;
  min?: number;
  max?: number;
};

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 10;

export function PhoneListInput({
  value,
  onChange,
  errors,
  arrayError,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
}: PhoneListInputProps) {
  const list = value;
  const canAdd = list.length < max;
  const canRemove = list.length > min;

  const update = (idx: number, patch: Partial<PhoneItemValue>) => {
    const next = list.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (idx: number) => {
    if (!canRemove) return;
    onChange(list.filter((_, i) => i !== idx));
  };

  const add = () => {
    if (!canAdd) return;
    onChange([...list, { number: '', label: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {list.map((p, i) => {
          const err = errors?.[i];
          const numberInvalid = !!err?.number;
          return (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
                <div className="space-y-1">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="04141234567"
                    value={p.number}
                    onChange={(e) =>
                      update(i, { number: formatPhoneDigits(e.target.value) })
                    }
                    onBlur={(e) => {
                      const v = formatPhoneDigits(e.target.value);
                      if (v && !PHONE_REGEX.test(v)) {
                        // leave field as-is; error shown below
                      }
                    }}
                    className={cn(
                      'h-9 font-mono',
                      numberInvalid && 'border-destructive focus-visible:ring-destructive/30',
                    )}
                  />
                  {numberInvalid && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {err?.number}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="Etiqueta (opcional)"
                    value={p.label ?? ''}
                    onChange={(e) => update(i, { label: e.target.value })}
                    maxLength={80}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                disabled={!canRemove}
                title={canRemove ? 'Quitar teléfono' : `Mínimo ${min}`}
                className={cn(
                  'h-9 w-9 text-destructive hover:bg-destructive-soft hover:text-destructive shrink-0',
                  !canRemove && 'opacity-40 cursor-not-allowed',
                )}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {arrayError && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {arrayError}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground font-normal">
          {list.length}/{max} teléfonos
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={!canAdd}
          className="gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar teléfono
        </Button>
      </div>
    </div>
  );
}
