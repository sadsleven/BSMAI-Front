import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
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
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { OrderReportStep } from '../components/stages/OrderReportStep';
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
    isReimbursement: values.type === 'credit' ? !!values.isReimbursement : undefined,
    // Número manual (orden vieja). Sin valor ⇒ el backend numera automáticamente.
    customOrderNumber:
      typeof values.customOrderNumber === 'number' && values.customOrderNumber > 0
        ? values.customOrderNumber
        : undefined,
    specialtyId: values.specialtyId,
    serviceTypes: (values.serviceTypes ?? []).map((r) => ({
      serviceTypeId: r.serviceTypeId,
      providerType: r.providerType,
      doctorId: r.providerType === 'doctor' ? r.doctorId || undefined : undefined,
      careCenterId:
        r.providerType === 'care_center' ? r.careCenterId || undefined : undefined,
      quantity: r.quantity ?? undefined,
      customName: (r.customName ?? '').trim(),
      // ST indexado sólo viaja con seguro no indexado (orden en modo tasa fija);
      // así un cambio de seguro tardío no arrastra flags fantasma.
      isIndexed:
        values.type === 'insurance' && values.useFixedRate
          ? !!r.isIndexed
          : undefined,
    })),
    pathologyIds: values.pathologyIds ?? [],
    orderDate: values.orderDate,
    appointmentDate: values.appointmentDate,
    priceAmount: values.priceAmount,
    // Motivo del ajuste: sólo cuando el monto difiere del base de catálogo (el
    // BE recalcula el base y exige el motivo si hay diferencia).
    priceAdjustmentNote:
      typeof values.priceBaseAmount === 'number' &&
      Math.round(values.priceBaseAmount * 100) !==
        Math.round(values.priceAmount * 100)
        ? (values.priceAdjustmentNote ?? '').trim()
        : undefined,
    casheaFirstInstallmentAmount:
      values.type === 'cashea'
        ? values.casheaFirstInstallmentAmount ?? 0
        : undefined,
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
      paymentAccountId: p.paymentAccountId || undefined,
      amountCurrency: p.amountCurrency,
      amountValue: p.amountValue,
    })),
  };
}

export function OrderEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { has, isSuperAdmin } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const providerLink = me?.providerLink ?? null;
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
    if (isWizardStep(id)) next.set('step', id);
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
      isReimbursement: false,
      specialtyId: '',
      serviceTypes: [],
      pathologyIds: [],
      orderDate: '',
      appointmentDate: '',
      priceAmount: 0,
      priceAdjustmentNote: '',
      casheaFirstInstallmentAmount: 0,
      casheaInitialPercent: 0,
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
        // Usuario proveedor: vista mínima (sólo su informe). No carga holder/
        // paciente ni resetea el form — esas consultas requieren permisos de
        // pacientes/STs que el proveedor no tiene ("Permisos insuficientes").
        if (providerLink) return;
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
          isReimbursement: !!order.isReimbursement,
          specialtyId: order.specialtyId,
          serviceTypes: (order.orderServiceTypes ?? []).map((row) => ({
            serviceTypeId: row.serviceTypeId,
            providerType: row.providerType,
            doctorId: row.doctorId ?? '',
            careCenterId: row.careCenterId ?? '',
            quantity: row.quantity ?? undefined,
            customName: row.customName ?? '',
            isIndexed: !!row.isIndexed,
          })),
          pathologyIds: (order.pathologies ?? []).map((p) => p.id),
          orderDate: order.orderDate.slice(0, 10),
          // El BE devuelve ISO UTC; el slice crudo dejaría la hora UTC (+4h en
          // VE) y hasta el día siguiente para citas nocturnas. Formatear local.
          appointmentDate: dayjs(order.appointmentDate).format('YYYY-MM-DDTHH:mm'),
          priceAmount: Number(order.priceAmount),
          priceBaseAmount:
            order.priceBaseAmount != null
              ? Number(order.priceBaseAmount)
              : undefined,
          // Fallback a la observación de la autorización: órdenes autorizadas
          // antes del ajuste no tienen `priceAdjustmentNote`.
          priceAdjustmentNote:
            order.priceAdjustmentNote ?? order.amountAuthorizationNote ?? '',
          casheaFirstInstallmentAmount:
            order.casheaFirstInstallmentAmount != null
              ? Number(order.casheaFirstInstallmentAmount)
              : 0,
          // % derivado del monto guardado (redondeo display a 2 decimales); el
          // monto persistido no se rederiva hasta que el usuario cambie el %.
          casheaInitialPercent:
            order.casheaFirstInstallmentAmount != null &&
            Number(order.priceAmount) > 0
              ? Math.round(
                  (Number(order.casheaFirstInstallmentAmount) /
                    Number(order.priceAmount)) *
                    10000,
                ) / 100
              : 0,
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

  // Regla de pago Paso 1 reportada por OrderForm (sólo `cash` bloquea aquí).
  const step1OkRef = useRef(true);
  const handleStep1Ok = useCallback((ok: boolean) => {
    step1OkRef.current = ok;
  }, []);

  // N° de orden libre (bloque completo, uno por proveedor).
  const numberOkRef = useRef(true);
  const handleNumberOk = useCallback((ok: boolean) => {
    numberOkRef.current = ok;
  }, []);

  // Solo el creador (o Super Admin) puede modificar el Paso 1. Los demás pasos
  // siguen disponibles según sus permisos. Espejo del guard BE.
  // Orden cancelada: el flujo queda congelado (espejo del guard BE). Se
  // reactiva desde el listado de órdenes.
  const isCancelled = initialOrder?.status === 'cancelled';

  const step1Locked =
    !!initialOrder &&
    !!me &&
    !isSuperAdmin &&
    initialOrder.createdById !== me.id;

  const onSubmit = async (values: OrderValues) => {
    if (!id || step1Locked) return;
    if (!numberOkRef.current) {
      notify.error(
        'El N° de orden elegido ya está en uso. Usa uno libre antes de guardar.',
      );
      return;
    }
    if (values.type === 'cash' && !step1OkRef.current) {
      notify.error(
        'La orden de contado debe estar cuadrada (pagos = total) para poder crearla y continuar al Paso 2.',
      );
      return;
    }
    try {
      await orderGateway.update(id, buildDto(values));
      notify.success('Orden actualizada');
      // Tras guardar el Paso 1, avanzar al Paso 2 (Atención). Refresca la orden
      // para que el paso refleje proveedores/servicios actualizados. Sin permiso
      // de atención, vuelve al listado.
      if (canAttention) {
        await fetchOrder();
        setCurrentStep('attention');
      } else {
        navigate('/orders');
      }
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar la orden.');
    }
  };

  const tryCancel = () => {
    if (methods.formState.isDirty) setConfirmCancel(true);
    else navigate('/orders');
  };

  if (fetching) {
    return <PageLoader label="Cargando orden…" />;
  }

  // Vista mínima de proveedor: sólo su informe (Paso 3), sin stepper ni form.
  if (providerLink && initialOrder) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageBreadcrumbs />
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Informe de la orden
            </h1>
            <p className="text-sm text-muted-foreground">
              {initialOrder.orderNumber} · {ORDER_STATUS_LABEL[initialOrder.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a órdenes
          </button>
        </div>
        <OrderReportStep
          key={initialOrder.id}
          order={initialOrder}
          scopeProvider={{ type: providerLink.type, id: providerLink.id }}
          onSaved={() => {
            void fetchOrder();
          }}
        />
      </div>
    );
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
            step1ReadOnly={step1Locked}
            onStepChange={setCurrentStep}
            onOrderRefresh={async () => {
              await fetchOrder();
            }}
            onStep1PaymentOkChange={handleStep1Ok}
            onOrderNumberOkChange={handleNumberOk}
          />

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {currentStep === 'register' &&
              initialOrder?.status === 'draft' &&
              !isCancelled &&
              !step1Locked ? (
                <Button type="submit" disabled={methods.formState.isSubmitting}>
                  {methods.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              ) : null}
              {currentStep === 'register' && initialOrder && canAttention && !isCancelled ? (
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
