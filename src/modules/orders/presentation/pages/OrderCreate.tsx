import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { OrderForm } from '../components/OrderForm';
import { orderGateway } from '../../infrastructure/orderGateway';
import type { CreateOrderDto } from '../../domain/models/order';
import { orderSchema, type OrderValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

const todayIso = () => new Date().toISOString().slice(0, 10);

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
    specialtyId: values.specialtyId,
    serviceTypes: (values.serviceTypes ?? []).map((r) => ({
      serviceTypeId: r.serviceTypeId,
      providerType: r.providerType,
      doctorId: r.providerType === 'doctor' ? r.doctorId || undefined : undefined,
      careCenterId:
        r.providerType === 'care_center' ? r.careCenterId || undefined : undefined,
      quantity: r.quantity ?? undefined,
    })),
    pathologyIds: values.pathologyIds ?? [],
    orderDate: values.orderDate,
    appointmentDate: values.appointmentDate,
    priceAmount: values.priceAmount,
    casheaFirstInstallmentAmount:
      values.type === 'cashea'
        ? values.casheaFirstInstallmentAmount ?? 0
        : undefined,
    useFixedRate: values.type === 'insurance' && !!values.useFixedRate,
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
  const { has } = usePermissions();
  const canAttention = has(PERMISSIONS.ORDERS.STAGE_ATTENTION);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const methods = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    mode: 'onBlur',
    defaultValues: {
      branchId: '',
      type: 'cash',
      holderId: '',
      patientId: '',
      contractorId: '',
      insuranceId: '',
      insuranceSource: '',
      serviceKey: '',
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
    },
  });

  const { handleSubmit, formState } = methods;

  // Regla de pago Paso 1 reportada por OrderForm (sólo `cash` bloquea acá).
  const step1OkRef = useRef(true);
  const handleStep1Ok = useCallback((ok: boolean) => {
    step1OkRef.current = ok;
  }, []);

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
                Paso 1: Creación de la orden. Al crearla, pasás a la atención del
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

          <OrderForm onStep1PaymentOkChange={handleStep1Ok} />

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={tryCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
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
        description="Hay cambios sin guardar. ¿Salir y descartarlos?"
        confirmLabel="Descartar"
        confirmVariant="destructive"
        onConfirm={() => navigate('/orders')}
      />
    </div>
  );
}
