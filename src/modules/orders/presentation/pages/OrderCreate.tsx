import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
import { ChevronLeft, AlertTriangle, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OrderForm } from '../components/OrderForm';
import { orderGateway } from '../../infrastructure/orderGateway';
import { orderDraftGateway } from '../../infrastructure/orderDraftGateway';
import {
  ORDER_TYPE_LABEL,
  type CreateOrderDto,
} from '../../domain/models/order';
import { orderSchema, type OrderValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { displayName } from '@/modules/patients/domain/models/patient';
import type { Patient } from '@/modules/patients/domain/models/patient';

const todayIso = () => new Date().toISOString().slice(0, 10);

const DEFAULT_VALUES: OrderValues = {
  branchId: '',
  type: 'cash',
  holderId: '',
  patientId: '',
  contractorId: '',
  insuranceId: '',
  insuranceSource: '',
  serviceKey: '',
  isReimbursement: false,
  specialtyId: '',
  serviceTypes: [],
  pathologyIds: [],
  orderDate: todayIso(),
  appointmentDate: '',
  priceAmount: 0,
  casheaFirstInstallmentAmount: 0,
  useFixedRate: false,
  fixedExchangeRateId: '',
  payments: [],
};

function buildDto(values: OrderValues): CreateOrderDto {
  return {
    branchId: values.branchId,
    type: values.type,
    holderId: values.holderId,
    patientId: values.patientId,
    contractorId: values.contractorId || undefined,
    insuranceId: values.insuranceId || undefined,
    insuranceSource:
      values.type === 'insurance' && values.insuranceSource
        ? (values.insuranceSource as 'direct' | 'via_contractor')
        : undefined,
    serviceKey:
      values.type === 'insurance' && values.serviceKey?.trim()
        ? values.serviceKey.trim()
        : undefined,
    isReimbursement: values.type === 'credit' ? !!values.isReimbursement : undefined,
    specialtyId: values.specialtyId,
    serviceTypes: (values.serviceTypes ?? []).map((r) => ({
      serviceTypeId: r.serviceTypeId,
      providerType: r.providerType,
      doctorId: r.providerType === 'doctor' ? r.doctorId || undefined : undefined,
      careCenterId:
        r.providerType === 'care_center' ? r.careCenterId || undefined : undefined,
      quantity: r.quantity ?? undefined,
      customName: (r.customName ?? '').trim(),
    })),
    pathologyIds: values.pathologyIds ?? [],
    orderDate: values.orderDate,
    appointmentDate: values.appointmentDate,
    priceAmount: values.priceAmount,
    casheaFirstInstallmentAmount:
      values.type === 'cashea'
        ? values.casheaFirstInstallmentAmount ?? 0
        : undefined,
    fixedExchangeRateId:
      values.type === 'insurance' && values.useFixedRate && values.fixedExchangeRateId
        ? values.fixedExchangeRateId
        : undefined,
    payments: (values.payments ?? []).map((p) => ({
      type: p.type,
      paymentDate: p.paymentDate,
      referenceNumber: p.referenceNumber || undefined,
      bankCode: p.bankCode || undefined,
      exchangeRateId: p.exchangeRateId || undefined,
      accountNumber: p.accountNumber || undefined,
      paymentAccountId: p.paymentAccountId || undefined,
      amountCurrency: p.amountCurrency,
      amountValue: p.amountValue,
    })),
  };
}

export function OrderCreate() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { has } = usePermissions();
  const canAttention = has(PERMISSIONS.ORDERS.STAGE_ATTENTION);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Reanudar un borrador parcial: ?draft=<id>. Hidrata el form (y los selects de
  // titular/paciente) antes de montar OrderForm.
  const resumeDraftId = searchParams.get('draft');
  const [draftId, setDraftId] = useState<string | null>(resumeDraftId);
  const [hydrating, setHydrating] = useState<boolean>(!!resumeDraftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const [initialHolder, setInitialHolder] = useState<Patient | null>(null);
  const [initialPatient, setInitialPatient] = useState<Patient | null>(null);

  const methods = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    mode: 'onBlur',
    defaultValues: DEFAULT_VALUES,
  });

  const { handleSubmit, formState } = methods;

  useEffect(() => {
    if (!resumeDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await orderDraftGateway.getById(resumeDraftId);
        if (cancelled) return;
        const payload = (draft.payload ?? {}) as Partial<OrderValues>;
        methods.reset({ ...DEFAULT_VALUES, ...payload });
        const holderId = payload.holderId;
        const patientId = payload.patientId;
        if (holderId) {
          const [h, p] = await Promise.all([
            patientGateway.getById(holderId).catch(() => null),
            patientId && patientId !== holderId
              ? patientGateway.getById(patientId).catch(() => null)
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setInitialHolder(h);
          setInitialPatient(p ?? h);
        }
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar el borrador.');
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regla de pago Paso 1 reportada por OrderForm (sólo `cash` bloquea aquí).
  const step1OkRef = useRef(true);
  const handleStep1Ok = useCallback((ok: boolean) => {
    step1OkRef.current = ok;
  }, []);

  // Guardar como borrador: persiste los valores crudos (sin validar) para poder
  // salir y retomar. No bloquea por campos incompletos.
  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      const values = methods.getValues();
      let label = ORDER_TYPE_LABEL[values.type] ?? 'Orden';
      if (values.holderId) {
        try {
          const h = await patientGateway.getById(values.holderId);
          label = `${ORDER_TYPE_LABEL[values.type]} · ${displayName(h)}`;
        } catch {
          /* best-effort: la etiqueta queda sólo con el tipo */
        }
      }
      const dto = {
        branchId: values.branchId || undefined,
        label,
        payload: values as Partial<OrderValues>,
      };
      const saved = draftId
        ? await orderDraftGateway.update(draftId, dto)
        : await orderDraftGateway.create(dto);
      if (!draftId) {
        setDraftId(saved.id);
        const next = new URLSearchParams(searchParams);
        next.set('draft', saved.id);
        setSearchParams(next, { replace: true });
      }
      // Lo guardado ya no son "cambios sin guardar": limpia isDirty.
      methods.reset(values);
      notify.success('Borrador guardado.');
    } catch (e) {
      notify.fromError(e, 'No se pudo guardar el borrador.');
    } finally {
      setSavingDraft(false);
    }
  };

  const onSubmit = async (values: OrderValues) => {
    if (values.type === 'cash' && !step1OkRef.current) {
      notify.error(
        'La orden de contado debe estar cuadrada (pagos = total) para poder crearla y continuar al Paso 2.',
      );
      return;
    }
    try {
      const dto = buildDto(values);
      const created = await orderGateway.create(dto);
      // La orden ya es real: el borrador parcial ya no hace falta.
      if (draftId) {
        try {
          await orderDraftGateway.remove(draftId);
        } catch {
          /* el borrador huérfano no es crítico */
        }
      }
      notify.success('Orden creada.');
      // Tras crear, avanzar directo al Paso 2 (Atención). Si el usuario no tiene
      // permiso de atención, queda en el Paso 1 de la orden ya guardada.
      const target = canAttention
        ? `/orders/edit/${created.id}?step=attention`
        : `/orders/edit/${created.id}`;
      navigate(target, { preventScrollReset: true });
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la orden.');
    }
  };

  const tryCancel = () => {
    if (formState.isDirty) setConfirmCancel(true);
    else navigate('/orders');
  };

  if (hydrating) {
    return <PageLoader label="Cargando borrador…" />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Nueva orden
              </h1>
              <p className="text-sm text-muted-foreground">
                Paso 1: Creación de la orden. Al crearla, pasas a la atención del
                paciente.
              </p>
            </div>
            <button
              type="button"
              onClick={tryCancel}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a órdenes
            </button>
          </div>

          <OrderForm
            initialHolder={initialHolder}
            initialPatient={initialPatient}
            onStep1PaymentOkChange={handleStep1Ok}
          />

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={tryCancel}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={saveDraft}
                disabled={savingDraft || formState.isSubmitting}
                className="gap-1.5"
              >
                <Save className="w-4 h-4" />
                {savingDraft ? 'Guardando…' : 'Guardar borrador'}
              </Button>
              <Button type="submit" disabled={formState.isSubmitting || savingDraft}>
                {formState.isSubmitting ? 'Guardando…' : 'Crear orden'}
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
        description={
          draftId
            ? 'Hay cambios sin guardar desde el último borrador. ¿Salir y descartarlos? El borrador guardado se mantiene.'
            : 'Hay cambios sin guardar. ¿Salir y descartarlos?'
        }
        confirmLabel="Descartar"
        confirmVariant="destructive"
        onConfirm={() => navigate('/orders')}
      />
    </div>
  );
}
