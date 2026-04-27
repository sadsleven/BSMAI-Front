import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Wallet, Banknote, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Bank } from '@/modules/banks/domain/models/bank';
import { formatPhoneDigits } from '@/lib/validations/ve-formats';
import type { PaymentMethodValues } from '@/lib/validations/schemas';
import { cn } from '@/lib/utils';

export type PaymentMethodErrors = Partial<
  Record<keyof PaymentMethodValues, string>
> | undefined;

/** Auto-fill defaults derived from owner data; user can override. */
export type PaymentDefaults = {
  cedula?: string;
  rif?: string | null;
  fullName?: string;
  firstPhone?: string;
};

export type PaymentMethodsInputProps = {
  value: PaymentMethodValues[];
  onChange: (next: PaymentMethodValues[]) => void;
  errors?: PaymentMethodErrors[];
  arrayError?: string;
  defaults?: PaymentDefaults;
  max?: number;
};

const TYPE_LABEL: Record<PaymentMethodValues['type'], string> = {
  mobile_payment: 'Pago Móvil',
  bank_transfer: 'Transferencia',
  other: 'Otro',
};

const TYPE_ICON = {
  mobile_payment: Wallet,
  bank_transfer: Banknote,
  other: FileText,
} as const;

function emptyMethod(type: PaymentMethodValues['type']): PaymentMethodValues {
  return {
    type,
    isActive: true,
    bankCode: '',
    phoneNumber: '',
    idDocument: '',
    accountNumber: '',
    accountHolderName: '',
    description: '',
  };
}

/**
 * Aplica defaults sólo si el campo está vacío y aplica al tipo seleccionado.
 * Sólo se ejecuta al cambiar el tipo o al agregar uno nuevo — no pisa edición manual.
 */
function applyDefaults(
  m: PaymentMethodValues,
  defaults: PaymentDefaults | undefined,
): PaymentMethodValues {
  if (!defaults) return m;
  const idDoc = defaults.rif || defaults.cedula || '';
  const next = { ...m };
  if (m.type === 'mobile_payment') {
    if (!next.phoneNumber && defaults.firstPhone) next.phoneNumber = defaults.firstPhone;
    if (!next.idDocument && idDoc) next.idDocument = idDoc;
  } else if (m.type === 'bank_transfer') {
    if (!next.idDocument && idDoc) next.idDocument = idDoc;
    if (!next.accountHolderName && defaults.fullName)
      next.accountHolderName = defaults.fullName;
  }
  return next;
}

export function PaymentMethodsInput({
  value,
  onChange,
  errors,
  arrayError,
  defaults,
  max = 20,
}: PaymentMethodsInputProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await bankGateway.list();
        if (!cancelled) setBanks(list);
      } catch {
        if (!cancelled) setBanks([]);
      } finally {
        if (!cancelled) setLoadingBanks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const banksByCode = useMemo(() => {
    const m = new Map<string, Bank>();
    for (const b of banks) m.set(b.code, b);
    return m;
  }, [banks]);

  const update = (idx: number, patch: Partial<PaymentMethodValues>) => {
    const next = value.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange(next);
  };

  const changeType = (idx: number, type: PaymentMethodValues['type']) => {
    const reset = { ...emptyMethod(type), id: value[idx]?.id, isActive: value[idx]?.isActive };
    onChange(
      value.map((m, i) => (i === idx ? applyDefaults(reset, defaults) : m)),
    );
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const add = (type: PaymentMethodValues['type']) => {
    if (value.length >= max) return;
    onChange([...value, applyDefaults(emptyMethod(type), defaults)]);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
          No hay métodos de pago. Agregá al menos uno desde los botones de abajo.
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((m, i) => {
            const err = errors?.[i];
            const Icon = TYPE_ICON[m.type];
            return (
              <div key={i} className="border rounded-lg p-3 bg-muted/10 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-brand-blue-soft text-brand-blue flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 flex-1">
                    <Select
                      value={m.type}
                      onValueChange={(v) =>
                        changeType(i, v as PaymentMethodValues['type'])
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mobile_payment">Pago Móvil</SelectItem>
                        <SelectItem value="bank_transfer">Transferencia bancaria</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground self-center">
                      {TYPE_LABEL[m.type]}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    title="Quitar método"
                    className="h-9 w-9 text-destructive hover:bg-destructive-soft hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {m.type === 'mobile_payment' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Banco *</Label>
                      <Select
                        value={m.bankCode || ''}
                        onValueChange={(v) => update(i, { bankCode: v })}
                      >
                        <SelectTrigger
                          className={cn('h-9', err?.bankCode && 'border-destructive')}
                        >
                          <SelectValue
                            placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.code} value={b.code}>
                              {b.code} — {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {err?.bankCode && (
                        <p className="text-xs text-destructive">{err.bankCode}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono *</Label>
                      <Input
                        value={m.phoneNumber ?? ''}
                        onChange={(e) =>
                          update(i, { phoneNumber: formatPhoneDigits(e.target.value) })
                        }
                        placeholder="04141234567"
                        className={cn(
                          'h-9 font-mono',
                          err?.phoneNumber && 'border-destructive',
                        )}
                      />
                      {err?.phoneNumber && (
                        <p className="text-xs text-destructive">{err.phoneNumber}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cédula/RIF *</Label>
                      <Input
                        value={m.idDocument ?? ''}
                        onChange={(e) => update(i, { idDocument: e.target.value })}
                        placeholder="V-12.345.678"
                        className={cn(
                          'h-9 font-mono',
                          err?.idDocument && 'border-destructive',
                        )}
                      />
                      {err?.idDocument && (
                        <p className="text-xs text-destructive">{err.idDocument}</p>
                      )}
                    </div>
                  </div>
                )}

                {m.type === 'bank_transfer' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Banco *</Label>
                      <Select
                        value={m.bankCode || ''}
                        onValueChange={(v) => update(i, { bankCode: v })}
                      >
                        <SelectTrigger
                          className={cn('h-9', err?.bankCode && 'border-destructive')}
                        >
                          <SelectValue
                            placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.code} value={b.code}>
                              {b.code} — {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {err?.bankCode && (
                        <p className="text-xs text-destructive">{err.bankCode}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Número de cuenta *</Label>
                      <Input
                        value={m.accountNumber ?? ''}
                        onChange={(e) => update(i, { accountNumber: e.target.value })}
                        placeholder="0000-0000-00-0000000000"
                        className={cn(
                          'h-9 font-mono',
                          err?.accountNumber && 'border-destructive',
                        )}
                      />
                      {err?.accountNumber && (
                        <p className="text-xs text-destructive">{err.accountNumber}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Titular *</Label>
                      <Input
                        value={m.accountHolderName ?? ''}
                        onChange={(e) =>
                          update(i, { accountHolderName: e.target.value })
                        }
                        className={cn(
                          'h-9',
                          err?.accountHolderName && 'border-destructive',
                        )}
                      />
                      {err?.accountHolderName && (
                        <p className="text-xs text-destructive">{err.accountHolderName}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cédula/RIF del titular *</Label>
                      <Input
                        value={m.idDocument ?? ''}
                        onChange={(e) => update(i, { idDocument: e.target.value })}
                        className={cn(
                          'h-9 font-mono',
                          err?.idDocument && 'border-destructive',
                        )}
                      />
                      {err?.idDocument && (
                        <p className="text-xs text-destructive">{err.idDocument}</p>
                      )}
                    </div>
                  </div>
                )}

                {m.type === 'other' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Descripción *</Label>
                    <Textarea
                      value={m.description ?? ''}
                      onChange={(e) => update(i, { description: e.target.value })}
                      rows={2}
                      placeholder="Detalles del método (efectivo, USD, Zelle, etc.)"
                      className={cn(err?.description && 'border-destructive')}
                    />
                    {err?.description && (
                      <p className="text-xs text-destructive">{err.description}</p>
                    )}
                  </div>
                )}

                {m.type === 'mobile_payment' && m.bankCode && banksByCode.has(m.bankCode) && (
                  <p className="text-[11px] text-muted-foreground">
                    {banksByCode.get(m.bankCode)?.name}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {arrayError && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {arrayError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Label className="text-xs text-muted-foreground font-normal">
          {value.length}/{max} métodos
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add('mobile_payment')}
            disabled={value.length >= max}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Pago móvil
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add('bank_transfer')}
            disabled={value.length >= max}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Transferencia
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add('other')}
            disabled={value.length >= max}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Otro
          </Button>
        </div>
      </div>
    </div>
  );
}
