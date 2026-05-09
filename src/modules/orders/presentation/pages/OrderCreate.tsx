import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { OrderForm } from '../components/OrderForm';
import { orderGateway } from '../../infrastructure/orderGateway';
import type { CreateOrderDto } from '../../domain/models/order';
import { orderSchema, type OrderValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';

const todayIso = () => new Date().toISOString().slice(0, 10);

function buildDto(values: OrderValues): CreateOrderDto {
  return {
    branchId: values.branchId,
    type: values.type,
    holderId: values.holderId,
    patientId: values.patientId,
    contractorId: values.contractorId || undefined,
    insuranceId: values.insuranceId || undefined,
    providerType: values.providerType,
    doctorId: values.doctorId || undefined,
    careCenterId: values.careCenterId || undefined,
    specialtyId: values.specialtyId,
    serviceTypeIds: values.serviceTypeIds ?? [],
    pathologyIds: values.pathologyIds ?? [],
    orderDate: values.orderDate,
    appointmentDate: values.appointmentDate,
    priceCurrency: values.priceCurrency,
    priceAmount: values.priceAmount,
    payments: (values.payments ?? []).map((p) => ({
      type: p.type,
      paymentDate: p.paymentDate,
      referenceNumber: p.referenceNumber || undefined,
      bankCode: p.bankCode || undefined,
      exchangeRateId: p.exchangeRateId || undefined,
      accountNumber: p.accountNumber || undefined,
      amountCurrency: p.amountCurrency,
      amountValue: p.amountValue,
    })),
  };
}

export function OrderCreate() {
  const navigate = useNavigate();
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
      providerType: 'doctor',
      doctorId: '',
      careCenterId: '',
      specialtyId: '',
      serviceTypeIds: [],
      pathologyIds: [],
      orderDate: todayIso(),
      appointmentDate: '',
      priceCurrency: 'USD',
      priceAmount: 0,
      payments: [],
    },
  });

  const { handleSubmit, formState } = methods;

  const onSubmit = async (values: OrderValues) => {
    try {
      const dto = buildDto(values);
      await orderGateway.create(dto);
      notify.success('Orden creada en borrador');
      navigate('/orders');
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
                Paso 1: Registro de la orden. Los pasos posteriores aún no están
                implementados.
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

          <OrderForm />

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
                disabled
                title="Guardá el borrador para acceder al Paso 2"
              >
                Continuar al Paso 2
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? 'Guardando…' : 'Guardar borrador'}
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
