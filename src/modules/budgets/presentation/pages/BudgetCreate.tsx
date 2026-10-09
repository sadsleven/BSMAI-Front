import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { budgetSchema, type BudgetValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { BudgetForm } from '../components/BudgetForm';
import { budgetGateway } from '../../infrastructure/budgetGateway';
import {
  BUDGET_DEFAULT_VALUES,
  buildBudgetDto,
} from '../../domain/models/budgetFormValues';

export function BudgetCreate() {
  const navigate = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const methods = useForm<BudgetValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: BUDGET_DEFAULT_VALUES,
    mode: 'onBlur',
  });
  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: BudgetValues) => {
    try {
      const created = await budgetGateway.create(buildBudgetDto(values));
      notify.success(`Presupuesto ${created.budgetNumber} creado.`);
      navigate(`/budgets/${created.id}`, { preventScrollReset: true });
    } catch (err) {
      notify.fromError(err, 'No se pudo crear el presupuesto.');
    }
  };

  const tryCancel = () => {
    if (formState.isDirty) setConfirmCancel(true);
    else navigate('/budgets');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))}
          className="space-y-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">
                Nuevo presupuesto
              </h1>
              <p className="text-sm text-muted-foreground">
                Al guardarlo podrás descargarlo en Excel o PDF, y crear la orden
                cuando lo aprueben.
              </p>
            </div>
            <button
              type="button"
              onClick={tryCancel}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Volver a presupuestos
            </button>
          </div>

          <BudgetForm />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={tryCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Guardando…' : 'Crear presupuesto'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="warning"
        icon={AlertTriangle}
        title="Descartar cambios"
        description="Hay cambios sin guardar. ¿Salir y descartarlos?"
        confirmLabel="Descartar"
        confirmVariant="destructive"
        onConfirm={() => navigate('/budgets')}
      />
    </div>
  );
}
