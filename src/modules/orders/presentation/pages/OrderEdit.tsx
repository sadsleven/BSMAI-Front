import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { OrderForm } from '../components/OrderForm';
import { orderGateway } from '../../infrastructure/orderGateway';
import type {
  CreateOrderDto,
  Order,
  OrderPaymentInput,
} from '../../domain/models/order';
import { orderSchema, type OrderValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import type { Patient } from '@/modules/patients/domain/models/patient';
import type { ProviderSelectValue } from '../components/ProviderSearchSelect';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';

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
    payments: (values.payments ?? []).map<OrderPaymentInput>((p) => ({
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

export function OrderEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [initialOrder, setInitialOrder] = useState<Order | null>(null);
  const [holder, setHolder] = useState<Patient | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [provider, setProvider] = useState<ProviderSelectValue | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('register');

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
      orderDate: '',
      appointmentDate: '',
      priceCurrency: 'USD',
      priceAmount: 0,
      payments: [],
    },
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const order = await orderGateway.getById(id);
        setInitialOrder(order);
        if (order.status !== 'draft') {
          notify.warning('Esta orden no está en borrador y no puede editarse.');
          navigate('/orders');
          return;
        }
        const [h, p, prov] = await Promise.all([
          patientGateway.getById(order.holderId),
          order.patientId === order.holderId
            ? Promise.resolve(null)
            : patientGateway.getById(order.patientId),
          order.providerType === 'doctor' && order.doctorId
            ? doctorGateway.getById(order.doctorId).then(
                (d): ProviderSelectValue => ({ providerType: 'doctor', doctor: d }),
              )
            : order.careCenterId
              ? careCenterGateway.getById(order.careCenterId).then(
                  (cc): ProviderSelectValue => ({ providerType: 'care_center', careCenter: cc }),
                )
              : Promise.resolve(null),
        ]);
        setHolder(h);
        setPatient(p ?? h);
        setProvider(prov);

        methods.reset({
          branchId: order.branchId,
          type: order.type,
          holderId: order.holderId,
          patientId: order.patientId,
          contractorId: order.contractorId ?? '',
          insuranceId: order.insuranceId ?? '',
          providerType: order.providerType,
          doctorId: order.doctorId ?? '',
          careCenterId: order.careCenterId ?? '',
          specialtyId: order.specialtyId,
          serviceTypeIds: (order.serviceTypes ?? []).map((s) => s.id),
          pathologyIds: (order.pathologies ?? []).map((p) => p.id),
          orderDate: order.orderDate.slice(0, 10),
          appointmentDate: order.appointmentDate.slice(0, 16),
          priceCurrency: order.priceCurrency,
          priceAmount: Number(order.priceAmount),
          payments: (order.payments ?? []).map((pay) => ({
            id: pay.id,
            type: pay.type,
            paymentDate: pay.paymentDate.slice(0, 10),
            referenceNumber: pay.referenceNumber ?? '',
            bankCode: pay.bankCode ?? '',
            exchangeRateId: pay.exchangeRateId ?? '',
            accountNumber: pay.accountNumber ?? '',
            amountCurrency: pay.amountCurrency,
            amountValue: Number(pay.amountValue),
          })),
        });
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar la orden.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: OrderValues) => {
    if (!id) return;
    try {
      await orderGateway.update(id, buildDto(values));
      notify.success('Orden actualizada');
      navigate('/orders');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar la orden.');
    }
  };

  const tryCancel = () => {
    if (methods.formState.isDirty) setConfirmCancel(true);
    else navigate('/orders');
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando orden…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Editar orden
              </h1>
              {initialOrder ? (
                <p className="text-sm text-muted-foreground">
                  {initialOrder.orderNumber} · Borrador
                </p>
              ) : null}
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
            initialHolder={holder}
            initialPatient={patient}
            initialProvider={provider}
            savedOrder={initialOrder}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
          />

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={tryCancel}>
                Cancelar
              </Button>
              {currentStep === 'register' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('process')}
                  disabled={!initialOrder}
                  title={
                    initialOrder
                      ? 'Avanzar al Paso 2'
                      : 'Guardá la orden primero para acceder al Paso 2'
                  }
                >
                  Continuar al Paso 2
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('register')}
                >
                  Volver al Paso 1
                </Button>
              )}
              <Button type="submit" disabled={methods.formState.isSubmitting}>
                {methods.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
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
