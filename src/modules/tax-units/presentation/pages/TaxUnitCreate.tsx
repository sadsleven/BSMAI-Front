import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { taxUnitGateway } from '../../infrastructure/taxUnitGateway';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { taxUnitSchema, type TaxUnitValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { ChevronLeft, AlertTriangle } from 'lucide-react';

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TaxUnitCreate() {
  const navigate = useNavigate();

  const {
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TaxUnitValues>({
    resolver: zodResolver(taxUnitSchema),
    mode: 'onBlur',
    defaultValues: {
      amountBs: undefined as unknown as number,
      effectiveDate: todayIso(),
      isActive: true,
    },
  });

  const isActive = watch('isActive') ?? true;

  const onSubmit = async (values: TaxUnitValues) => {
    try {
      await taxUnitGateway.create({
        amountBs: values.amountBs,
        effectiveDate: values.effectiveDate,
        isActive: values.isActive,
      });
      notify.success('Unidad Tributaria creada exitosamente');
      navigate('/tax-units');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la unidad tributaria.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <form
        onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))}
        className="space-y-6"
        noValidate
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Nueva unidad tributaria
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/tax-units')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a unidades tributarias
          </button>
        </div>

        <FormSection
          title="Información"
          description="El valor de 1 UT en bolívares según Gaceta Oficial. La UT vigente se toma como la más reciente con fecha efectiva ≤ hoy."
        >
          <FormGrid>
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
                <p className="text-xs text-muted-foreground">Bolívares por 1 UT. Ej: 43,00</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate" className="text-sm font-medium">
                Fecha efectiva <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="effectiveDate"
                render={({ field }) => (
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    aria-invalid={!!errors.effectiveDate}
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
            description="Si está deshabilitada, no se considera al consultar la UT vigente."
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
            <Button type="button" variant="outline" onClick={() => navigate('/tax-units')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear UT'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
