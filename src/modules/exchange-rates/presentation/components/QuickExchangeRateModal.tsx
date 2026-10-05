import { useEffect } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { exchangeRateSchema, type ExchangeRateValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { toIsoWithOffset } from '@/lib/dates';
import { AlertTriangle, DollarSign, X } from 'lucide-react';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';
import type { Currency, ExchangeRate } from '../../domain/models/exchangeRate';

export type QuickExchangeRateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Moneda de la tasa a crear. No se puede cambiar desde el modal. */
  currency: Currency;
  /** Monto precargado (normalmente el de la tasa seleccionada, para ajustar decimales). */
  defaultAmountBs?: number;
  /** Fecha efectiva precargada (por defecto, la de la tasa seleccionada). */
  defaultEffectiveDate?: string;
  /** La tasa creada, ya persistida. El caller la selecciona. */
  onCreated: (rate: ExchangeRate) => void;
};

function nowIsoLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return toIsoWithOffset(d);
}

/**
 * Alta rápida de tasa de cambio sin salir de la pantalla (órdenes, cuentas por
 * cobrar y por pagar). Existe porque los seguros y los pagos suelen liquidar a
 * la tasa del día con uno o dos decimales distintos (866,56 vs 866,55): obliga
 * a crear una tasa nueva en pleno registro, y volver al CRUD de tasas hacía
 * perder lo ya cargado en el formulario.
 *
 * Al guardar, el gateway avisa a todos los selectores montados (ver
 * `subscribeRateCreated`), así que la nueva tasa aparece en la lista al
 * instante.
 */
export function QuickExchangeRateModal({
  open,
  onOpenChange,
  currency,
  defaultAmountBs,
  defaultEffectiveDate,
  onCreated,
}: QuickExchangeRateModalProps) {
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExchangeRateValues>({
    resolver: zodResolver(exchangeRateSchema),
    mode: 'onBlur',
    defaultValues: {
      currency,
      amountBs: defaultAmountBs,
      effectiveDate: defaultEffectiveDate || nowIsoLocal(),
      isActive: true,
    },
  });

  // Cada apertura parte de la tasa seleccionada en ese momento: casi siempre
  // sólo hay que corregirle los decimales.
  useEffect(() => {
    if (!open) return;
    reset({
      currency,
      amountBs: defaultAmountBs,
      effectiveDate: defaultEffectiveDate || nowIsoLocal(),
      isActive: true,
    });
  }, [open, currency, defaultAmountBs, defaultEffectiveDate, reset]);

  const amountBs = useWatch({ control, name: 'amountBs' });

  const onSubmit = async (values: ExchangeRateValues) => {
    try {
      const created = await exchangeRateGateway.create({
        currency,
        amountBs: values.amountBs,
        effectiveDate: values.effectiveDate,
        isActive: true,
      });
      notify.success('Tasa de cambio creada');
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la tasa de cambio.');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[480px] rounded-xl p-0 overflow-visible flex flex-col gap-0">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <AlertDialogHeader className="px-6 pt-5 pr-12 gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-blue-soft text-brand-blue-strong flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                Nueva tasa {currency}/Bs
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Queda guardada en el histórico de tasas y seleccionada acá mismo.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.stopPropagation();
            void handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))(e);
          }}
          className="flex flex-col"
        >
          <div className="px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-rate-amount" className="text-sm font-medium">
                Monto en bolívares <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="amountBs"
                render={({ field }) => (
                  <CurrencyAmountInput
                    id="quick-rate-amount"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.amountBs}
                  />
                )}
              />
              {errors.amountBs ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.amountBs.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bolívares por 1 {currency}. Máximo 2 decimales.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-rate-date" className="text-sm font-medium">
                Fecha y hora efectiva <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="effectiveDate"
                render={({ field }) => (
                  <DateTimePicker
                    id="quick-rate-date"
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? '')}
                    onBlur={field.onBlur}
                    invalid={!!errors.effectiveDate}
                    disableFuture
                  />
                )}
              />
              {errors.effectiveDate ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.effectiveDate.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Por defecto, la fecha de la tasa que estaba seleccionada.
                </p>
              )}
            </div>
          </div>
          <AlertDialogFooter className="px-6 py-4 border-t gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !amountBs}>
              {isSubmitting ? 'Creando…' : 'Crear y usar'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
