import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { exchangeRateGateway } from '../../infrastructure/exchangeRateGateway';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { exchangeRateSchema, type ExchangeRateValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { ChevronLeft, AlertTriangle } from 'lucide-react';

function nowIsoLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function ExchangeRateCreate() {
  const navigate = useNavigate();

  const {
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ExchangeRateValues>({
    resolver: zodResolver(exchangeRateSchema),
    mode: 'onBlur',
    defaultValues: {
      currency: 'USD',
      amountBs: undefined as unknown as number,
      effectiveDate: nowIsoLocal(),
      isActive: true,
    },
  });

  const isActive = watch('isActive') ?? true;
  const currency = watch('currency');

  const onSubmit = async (values: ExchangeRateValues) => {
    try {
      await exchangeRateGateway.create({
        currency: values.currency,
        amountBs: values.amountBs,
        effectiveDate: values.effectiveDate,
        isActive: values.isActive,
      });
      notify.success('Tasa de cambio creada exitosamente');
      navigate('/exchange-rates');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la tasa de cambio.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Nueva tasa de cambio
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/exchange-rates')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a tasas de cambio
          </button>
        </div>

        <FormSection
          title="Información"
          description="Las tasas son históricas — al crear una nueva no se sobreescriben las anteriores."
        >
          <FormGrid>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Moneda <span className="text-destructive">*</span>
              </Label>
              <Select
                value={currency}
                onValueChange={(v) =>
                  setValue('currency', v as 'USD' | 'EUR', {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — Dólar estadounidense</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
              {errors.currency ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.currency.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amountBs" className="text-sm font-medium">
                Monto en bolívares <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="amountBs"
                render={({ field }) => (
                  <CurrencyAmountInput
                    id="amountBs"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.amountBs}
                  />
                )}
              />
              {errors.amountBs ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.amountBs.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bolívares por 1 {currency}. Ej: 485,22
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="effectiveDate" className="text-sm font-medium">
                Fecha y hora efectiva <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="effectiveDate"
                render={({ field }) => (
                  <DateTimePicker
                    id="effectiveDate"
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? '')}
                    onBlur={field.onBlur}
                    invalid={!!errors.effectiveDate}
                    disableFuture
                  />
                )}
              />
              {errors.effectiveDate ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.effectiveDate.message}
                </p>
              ) : null}
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Estado">
          <FormSwitch
            label="Habilitada"
            description="Si está deshabilitada, no se considera al consultar la tasa actual."
            checked={isActive}
            onCheckedChange={(v) =>
              setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
            }
          />
        </FormSection>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Campos obligatorios
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/exchange-rates')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear tasa'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
