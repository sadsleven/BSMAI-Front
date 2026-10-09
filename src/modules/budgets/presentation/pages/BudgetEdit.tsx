import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { budgetSchema, type BudgetValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import type { Patient } from '@/modules/patients/domain/models/patient';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import { BudgetForm } from '../components/BudgetForm';
import { budgetGateway } from '../../infrastructure/budgetGateway';
import { budgetIsEditable, type Budget } from '../../domain/models/budget';
import {
  BUDGET_DEFAULT_VALUES,
  budgetToFormValues,
  buildBudgetDto,
} from '../../domain/models/budgetFormValues';

export function BudgetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [initialHolder, setInitialHolder] = useState<Patient | null>(null);
  const [initialPatient, setInitialPatient] = useState<Patient | null>(null);
  const [initialProviders, setInitialProviders] = useState<
    Map<string, Doctor | CareCenter>
  >(new Map());

  const methods = useForm<BudgetValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: BUDGET_DEFAULT_VALUES,
    mode: 'onBlur',
  });
  const { handleSubmit, formState, reset } = methods;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const b = await budgetGateway.getById(id);
      setBudget(b);
      reset(budgetToFormValues(b));
      // Chips de titular/paciente y proveedores: el detalle trae resúmenes, no
      // las entidades completas que piden los buscadores.
      const [holder, patient] = await Promise.all([
        patientGateway.getById(b.holderId).catch(() => null),
        b.patientId !== b.holderId
          ? patientGateway.getById(b.patientId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setInitialHolder(holder);
      setInitialPatient(patient ?? holder);

      const map = new Map<string, Doctor | CareCenter>();
      await Promise.all(
        (b.budgetServiceTypes ?? []).map(async (r) => {
          if (r.providerType === 'doctor' && r.doctorId) {
            const d = await doctorGateway.getById(r.doctorId).catch(() => null);
            if (d) map.set(`doctor:${r.doctorId}`, d);
          } else if (r.providerType === 'care_center' && r.careCenterId) {
            const c = await careCenterGateway
              .getById(r.careCenterId)
              .catch(() => null);
            if (c) map.set(`care_center:${r.careCenterId}`, c);
          }
        }),
      );
      setInitialProviders(map);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'No se pudo cargar el presupuesto.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (values: BudgetValues) => {
    if (!id) return;
    try {
      const updated = await budgetGateway.update(id, buildBudgetDto(values));
      notify.success(`Presupuesto ${updated.budgetNumber} actualizado.`);
      navigate(`/budgets/${id}`, { preventScrollReset: true });
    } catch (err) {
      notify.fromError(err, 'No se pudo guardar el presupuesto.');
    }
  };

  const tryCancel = () => {
    if (formState.isDirty) setConfirmCancel(true);
    else navigate(`/budgets/${id}`);
  };

  if (loading) return <PageLoader label="Cargando presupuesto…" />;
  if (loadError || !budget) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageBreadcrumbs />
        <EmptyState
          title="Presupuesto no disponible"
          description={loadError ?? 'No se encontró el presupuesto.'}
          action={
            <Button variant="outline" onClick={() => navigate('/budgets')}>
              Volver a presupuestos
            </Button>
          }
        />
      </div>
    );
  }

  const readOnly = !budgetIsEditable(budget);

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
                Presupuesto {budget.budgetNumber}
              </h1>
              <p className="text-sm text-muted-foreground">
                {readOnly
                  ? 'Ya generó su orden: los cambios se hacen en la orden.'
                  : 'Edita los datos y vuelve a descargar el documento.'}
              </p>
            </div>
            <button
              type="button"
              onClick={tryCancel}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Volver al detalle
            </button>
          </div>

          <BudgetForm
            initialHolder={initialHolder}
            initialPatient={initialPatient}
            initialProviders={initialProviders}
            readOnly={readOnly}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={tryCancel}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formState.isSubmitting || readOnly}
              >
                {formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
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
        onConfirm={() => navigate(`/budgets/${id}`)}
      />
    </div>
  );
}
