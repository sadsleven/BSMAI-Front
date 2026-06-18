import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
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
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { FormSwitch } from '@/components/ui/form-switch';
import { bankGateway } from '@/modules/banks/infrastructure/bankGateway';
import type { Bank } from '@/modules/banks/domain/models/bank';
import { formatPhoneDigits } from '@/lib/validations/ve-formats';
import type { PaymentAccountValues } from '@/lib/validations/schemas';
import { cn } from '@/lib/utils';
import { PAYMENT_ACCOUNT_TYPE_LABEL } from '../../domain/models/paymentAccount';

const TYPES: PaymentAccountValues['type'][] = [
  'mobile_payment',
  'bank_transfer',
  'bank_transfer_usd',
  'card',
  'other',
];

export type PaymentAccountFormFieldsProps = {
  /** Si true, el tipo no se puede cambiar (caso edición). */
  lockType?: boolean;
};

/**
 * Campos polimórficos del formulario de PaymentAccount. Requiere estar
 * dentro de un `FormProvider` con `useForm<PaymentAccountValues>`.
 */
export function PaymentAccountFormFields({ lockType }: PaymentAccountFormFieldsProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<PaymentAccountValues>();

  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    bankGateway
      .list()
      .then((bs) => {
        if (!cancelled) setBanks(bs);
      })
      .catch(() => {
        if (!cancelled) setBanks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBanks(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const banksByCode = useMemo(() => {
    const m = new Map<string, Bank>();
    for (const b of banks) m.set(b.code, b);
    return m;
  }, [banks]);

  const type = watch('type');
  const isActive = watch('isActive') ?? true;
  const bankCode = watch('bankCode');

  const invalid = (k: keyof PaymentAccountValues) =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  const showError = (k: keyof PaymentAccountValues) => {
    const err = errors[k];
    if (!err) return null;
    return (
      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
        <AlertTriangle className="w-3 h-3" />
        {String(err.message)}
      </p>
    );
  };

  // Al cambiar de tipo, limpiar los campos que no aplican al type nuevo.
  const onTypeChange = (next: PaymentAccountValues['type']) => {
    setValue('type', next, { shouldDirty: true, shouldValidate: true });
    if (next === 'mobile_payment') {
      setValue('accountNumber', '', { shouldDirty: true });
      setValue('description', '', { shouldDirty: true });
    } else if (next === 'bank_transfer' || next === 'bank_transfer_usd') {
      setValue('phoneNumber', '', { shouldDirty: true });
      setValue('description', '', { shouldDirty: true });
    } else if (next === 'card') {
      // Punto: solo banco + titular.
      setValue('phoneNumber', '', { shouldDirty: true });
      setValue('idDocument', '', { shouldDirty: true });
      setValue('accountNumber', '', { shouldDirty: true });
      setValue('description', '', { shouldDirty: true });
    } else {
      setValue('bankCode', '', { shouldDirty: true });
      setValue('phoneNumber', '', { shouldDirty: true });
      setValue('idDocument', '', { shouldDirty: true });
      setValue('accountNumber', '', { shouldDirty: true });
      setValue('accountHolderName', '', { shouldDirty: true });
    }
  };

  return (
    <>
      <FormSection
        title="Información general"
        description="Etiqueta visible para la cuenta y tipo de cobro."
      >
        <FormGrid>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Ej. BNC Pago Móvil — Sucursal Centro"
              {...register('name')}
              className={cn('h-9', invalid('name'))}
            />
            {showError('name')}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">
              Tipo <span className="text-destructive">*</span>
            </Label>
            <Select
              value={type ?? ''}
              onValueChange={(v) => onTypeChange(v as PaymentAccountValues['type'])}
              disabled={lockType}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccioná un tipo" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PAYMENT_ACCOUNT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lockType ? (
              <p className="text-xs text-muted-foreground">
                El tipo de cuenta no se puede modificar. Creá una nueva si necesitás otro tipo.
              </p>
            ) : null}
            {showError('type')}
          </div>
        </FormGrid>
      </FormSection>

      {type === 'mobile_payment' && (
        <FormSection title="Datos del Pago Móvil">
          <FormGrid>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Banco <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bankCode ?? ''}
                onValueChange={(v) =>
                  setValue('bankCode', v, { shouldDirty: true, shouldValidate: true })
                }
              >
                <SelectTrigger className={cn('h-9', invalid('bankCode'))}>
                  <SelectValue placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar banco'} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showError('bankCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumber" className="text-sm font-medium">
                Teléfono <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phoneNumber"
                placeholder="04141234567"
                value={watch('phoneNumber') ?? ''}
                onChange={(e) =>
                  setValue('phoneNumber', formatPhoneDigits(e.target.value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className={cn('h-9 font-mono', invalid('phoneNumber'))}
                maxLength={11}
              />
              {showError('phoneNumber')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idDocument" className="text-sm font-medium">
                Cédula/RIF <span className="text-destructive">*</span>
              </Label>
              <Input
                id="idDocument"
                placeholder="V-12.345.678"
                {...register('idDocument')}
                className={cn('h-9 font-mono', invalid('idDocument'))}
              />
              {showError('idDocument')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountHolderName" className="text-sm font-medium">
                Titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountHolderName"
                {...register('accountHolderName')}
                className={cn('h-9', invalid('accountHolderName'))}
              />
              {showError('accountHolderName')}
            </div>
          </FormGrid>
          {bankCode && banksByCode.has(bankCode) ? (
            <p className="text-xs text-muted-foreground mt-2">
              {banksByCode.get(bankCode)?.name}
            </p>
          ) : null}
        </FormSection>
      )}

      {type === 'bank_transfer' && (
        <FormSection title="Datos de la transferencia bancaria">
          <FormGrid>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Banco <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bankCode ?? ''}
                onValueChange={(v) =>
                  setValue('bankCode', v, { shouldDirty: true, shouldValidate: true })
                }
              >
                <SelectTrigger className={cn('h-9', invalid('bankCode'))}>
                  <SelectValue placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar banco'} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showError('bankCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountNumber" className="text-sm font-medium">
                Número de cuenta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountNumber"
                placeholder="00000000000000000000"
                {...register('accountNumber')}
                className={cn('h-9 font-mono', invalid('accountNumber'))}
                maxLength={20}
              />
              {showError('accountNumber')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountHolderName" className="text-sm font-medium">
                Titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountHolderName"
                {...register('accountHolderName')}
                className={cn('h-9', invalid('accountHolderName'))}
              />
              {showError('accountHolderName')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idDocument" className="text-sm font-medium">
                Cédula/RIF del titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="idDocument"
                placeholder="J-12.345.678-9"
                {...register('idDocument')}
                className={cn('h-9 font-mono', invalid('idDocument'))}
              />
              {showError('idDocument')}
            </div>
          </FormGrid>
        </FormSection>
      )}

      {type === 'bank_transfer_usd' && (
        <FormSection
          title="Datos de la transferencia en dólares"
          description="Cuenta en USD. Los cobros con esta cuenta se registran en dólares, sin tasa de cambio."
        >
          <FormGrid>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Banco <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bankCode ?? ''}
                onValueChange={(v) =>
                  setValue('bankCode', v, { shouldDirty: true, shouldValidate: true })
                }
              >
                <SelectTrigger className={cn('h-9', invalid('bankCode'))}>
                  <SelectValue placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar banco'} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showError('bankCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountNumberUsd" className="text-sm font-medium">
                Número de cuenta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountNumberUsd"
                placeholder="00000000000000000000"
                {...register('accountNumber')}
                className={cn('h-9 font-mono', invalid('accountNumber'))}
                maxLength={20}
              />
              {showError('accountNumber')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountHolderNameUsd" className="text-sm font-medium">
                Titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountHolderNameUsd"
                {...register('accountHolderName')}
                className={cn('h-9', invalid('accountHolderName'))}
              />
              {showError('accountHolderName')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idDocumentUsd" className="text-sm font-medium">
                Cédula/RIF del titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="idDocumentUsd"
                placeholder="J-12.345.678-9"
                {...register('idDocument')}
                className={cn('h-9 font-mono', invalid('idDocument'))}
              />
              {showError('idDocument')}
            </div>
          </FormGrid>
        </FormSection>
      )}

      {type === 'card' && (
        <FormSection
          title="Datos del Punto"
          description="Punto de venta (POS) de tarjeta. El número de referencia se ingresa al registrar cada cobro."
        >
          <FormGrid>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Banco <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bankCode ?? ''}
                onValueChange={(v) =>
                  setValue('bankCode', v, { shouldDirty: true, shouldValidate: true })
                }
              >
                <SelectTrigger className={cn('h-9', invalid('bankCode'))}>
                  <SelectValue placeholder={loadingBanks ? 'Cargando…' : 'Seleccionar banco'} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showError('bankCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accountHolderName" className="text-sm font-medium">
                Titular <span className="text-destructive">*</span>
              </Label>
              <Input
                id="accountHolderName"
                {...register('accountHolderName')}
                className={cn('h-9', invalid('accountHolderName'))}
              />
              {showError('accountHolderName')}
            </div>
          </FormGrid>
          {bankCode && banksByCode.has(bankCode) ? (
            <p className="text-xs text-muted-foreground mt-2">
              {banksByCode.get(bankCode)?.name}
            </p>
          ) : null}
        </FormSection>
      )}

      {type === 'other' && (
        <FormSection title="Detalle">
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm font-medium">
              Descripción <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="Detalles del método (Zelle, efectivo en otra moneda, etc.)"
              {...register('description')}
              className={invalid('description')}
            />
            {showError('description')}
          </div>
        </FormSection>
      )}

      <FormSection title="Estado">
        <FormSwitch
          label="Habilitada"
          description="Si está deshabilitada, no aparecerá como opción al registrar pagos o cobros."
          checked={isActive}
          onCheckedChange={(v) =>
            setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
          }
        />
      </FormSection>
    </>
  );
}
