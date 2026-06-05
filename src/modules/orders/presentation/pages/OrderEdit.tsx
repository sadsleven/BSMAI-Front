import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ChevronLeft, AlertTriangle, ArrowRight } from 'lucide-react';
import { OrderForm } from '../components/OrderForm';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  ORDER_STATUS_LABEL,
  type CreateOrderDto,
  type Order,
  type OrderPaymentInput,
} from '../../domain/models/order';
import { orderSchema, type OrderValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import type { Patient } from '@/modules/patients/domain/models/patient';
import type { ProviderSelectValue } from '../components/ProviderSearchSelect';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import {
  isWizardStep,
  lastAccessibleStep,
  type OrderWizardStep,
} from '../../domain/wizardStep';

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
    })),
    pathologyIds: values.pathologyIds ?? [],
    orderDate: values.orderDate,
    appointmentDate: values.appointmentDate,
    priceAmount: values.priceAmount,
    useFixedRate: values.type === 'insurance' && !!values.useFixedRate,
    fixedExchangeRateId:
      values.type === 'insurance' && values.useFixedRate && values.fixedExchangeRateId
        ? values.fixedExchangeRateId
        : undefined,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { has } = usePermissions();
  const canAttention = has(PERMISSIONS.ORDERS.STAGE_ATTENTION);
  const canReport = has(PERMISSIONS.ORDERS.STAGE_REPORT);
  const canBilling = has(PERMISSIONS.ORDERS.STAGE_BILLING);
  const [fetching, setFetching] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [initialOrder, setInitialOrder] = useState<Order | null>(null);
  const [holder, setHolder] = useState<Patient | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [provider, setProvider] = useState<ProviderSelectValue | null>(null);

  const urlStep = searchParams.get('step');
  const currentStep: OrderWizardStep = isWizardStep(urlStep)
    ? urlStep
    : initialOrder
      ? lastAccessibleStep(initialOrder, {
          attention: canAttention,
          report: canReport,
          billing: canBilling,
        })
      : 'register';

  const setCurrentStep = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (isWizardStep(id) && id !== 'register') next.set('step', id);
    else next.delete('step');
    setSearchParams(next, { replace: true });
  };

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
      orderDate: '',
      appointmentDate: '',
      priceAmount: 0,
      useFixedRate: false,
      fixedExchangeRateId: '',
      payments: [],
    },
  });

  const fetchOrder = async () => {
    if (!id) return null;
    const order = await orderGateway.getById(id);
    setInitialOrder(order);
    return order;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const order = await fetchOrder();
        if (!order) return;
        const [h, p] = await Promise.all([
          patientGateway.getById(order.holderId),
          order.patientId === order.holderId
            ? Promise.resolve(null)
            : patientGateway.getById(order.patientId),
        ]);
        setHolder(h);
        setPatient(p ?? h);
        setProvider(null);

        methods.reset({
          branchId: order.branchId,
          type: order.type,
          holderId: order.holderId,
          patientId: order.patientId,
          contractorId: order.contractorId ?? '',
          insuranceId: order.insuranceId ?? '',
          insuranceSource: order.insuranceSource ?? '',
          serviceKey: order.serviceKey ?? '',
          specialtyId: order.specialtyId,
          serviceTypes: (order.orderServiceTypes ?? []).map((row) => ({
            serviceTypeId: row.serviceTypeId,
            providerType: row.providerType,
            doctorId: row.doctorId ?? '',
            careCenterId: row.careCenterId ?? '',
          })),
          pathologyIds: (order.pathologies ?? []).map((p) => p.id),
          orderDate: order.orderDate.slice(0, 10),
          appointmentDate: order.appointmentDate.slice(0, 16),
          priceAmount: Number(order.priceAmount),
          useFixedRate: !!order.useFixedRate,
          fixedExchangeRateId: order.fixedExchangeRateId ?? '',
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
                {initialOrder?.status === 'draft' ? 'Editar orden' : 'Flujo de orden'}
              </h1>
              {initialOrder ? (
                <p className="text-sm text-muted-foreground">
                  {initialOrder.orderNumber} · {ORDER_STATUS_LABEL[initialOrder.status]}
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
            onOrderRefresh={async () => {
              await fetchOrder();
            }}
          />

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {currentStep === 'register' && initialOrder?.status === 'draft' ? (
                <Button type="submit" disabled={methods.formState.isSubmitting}>
                  {methods.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              ) : null}
              {currentStep === 'register' && initialOrder && canAttention ? (
                <Button
                  type="button"
                  variant={initialOrder.status === 'draft' ? 'outline' : 'default'}
                  onClick={() => setCurrentStep('attention')}
                >
                  Continuar a Atención
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : null}
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
