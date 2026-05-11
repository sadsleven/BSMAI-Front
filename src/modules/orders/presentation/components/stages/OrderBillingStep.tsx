import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { FormSection } from '@/components/ui/form-section';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { orderGateway } from '../../../infrastructure/orderGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import type { AccountsPayable } from '@/modules/accounts-payable/domain/models/accountsPayable';
import type { AccountsReceivable } from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import {
  OrderPaymentForm,
  paymentInOrderCurrency,
} from '../OrderPaymentForm';
import { downloadFacturacionXlsx } from '../orderExcel';
import { taxRateFor, useTaxRates } from '@/lib/config/taxRates';
import type {
  DoctorAmountCurrency,
  Order,
  OrderCurrency,
} from '../../../domain/models/order';
import type { OrderPaymentValues } from '@/lib/validations/schemas';

const CURRENCIES: DoctorAmountCurrency[] = ['USD', 'EUR', 'BS'];

/**
 * Paso 4 — Facturación y liquidación.
 *
 * - Descarga **factura única** con todos los STs en un solo archivo.
 * - Asigna `doctorAmount` (USD/EUR/BS) con cap (≤ priceAmount convertido).
 * - Calcula tax doctor (3% natural / 5% jurídico) + ganancia neta empresa.
 * - "Orden por pagar": componente de pagos para registrar pago al doctor/centro.
 * - "Orden por cobrar": componente de pagos para registrar cobro al seguro
 *   (sólo si `order.type === 'insurance'`).
 */
export function OrderBillingStep({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const priceAmount = Number(order.priceAmount);
  const isFinalized = order.status === 'finalized';

  const [doctorAmount, setDoctorAmount] = useState<number | undefined>(
    order.doctorAmount ? Number(order.doctorAmount) : undefined,
  );
  const [doctorAmountCurrency, setDoctorAmountCurrency] =
    useState<DoctorAmountCurrency>(order.doctorAmountCurrency ?? order.priceCurrency);
  const [rateBs, setRateBs] = useState<number | null>(
    order.billingExchangeRate ? Number(order.billingExchangeRate.amountBs) : null,
  );
  const [rateId, setRateId] = useState<string | null>(
    order.billingExchangeRateId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [downloadingFact, setDownloadingFact] = useState(false);

  // Cargar tasa actual si la orden no tiene billing rate persistida.
  useEffect(() => {
    if (rateId) return;
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent(order.priceCurrency);
        if (!cancelled) {
          setRateBs(Number(rate.amountBs));
          setRateId(rate.id);
        }
      } catch {
        // sin tasa actual
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.priceCurrency, rateId]);

  // Convertir doctorAmount a moneda de la orden para validar cap.
  const doctorAmountInOrderCurrency = useMemo(() => {
    if (doctorAmount === undefined || doctorAmount === null) return null;
    if (doctorAmountCurrency === order.priceCurrency) return doctorAmount;
    if (doctorAmountCurrency === 'BS') {
      if (!rateBs || rateBs <= 0) return null;
      return doctorAmount / rateBs;
    }
    return null;
  }, [doctorAmount, doctorAmountCurrency, order.priceCurrency, rateBs]);

  const exceedsCap =
    doctorAmountInOrderCurrency !== null &&
    doctorAmountInOrderCurrency > priceAmount + 0.005;

  // Tax (solo doctor) — tasas leídas desde `/config/tax-rates` (env-driven).
  const taxRates = useTaxRates();
  const isDoctor = order.providerType === 'doctor';
  const taxRate = isDoctor
    ? taxRateFor(taxRates, !!order.doctor?.isLegalEntity)
    : 0;
  const taxAmount =
    isDoctor && doctorAmount !== undefined ? doctorAmount * taxRate : 0;
  const taxAmountBs = useMemo(() => {
    if (!isDoctor || doctorAmount === undefined) return null;
    if (doctorAmountCurrency === 'BS') return taxAmount;
    if (!rateBs) return null;
    return taxAmount * rateBs;
  }, [isDoctor, doctorAmount, doctorAmountCurrency, rateBs, taxAmount]);

  const netProfit =
    doctorAmountInOrderCurrency !== null
      ? priceAmount - doctorAmountInOrderCurrency
      : null;

  const onSubmit = async () => {
    if (doctorAmount === undefined || doctorAmount <= 0) {
      notify.error('Ingresá un monto al doctor válido');
      return;
    }
    if (!rateId) {
      notify.error('No hay tasa de cambio activa para registrar la facturación');
      return;
    }
    if (exceedsCap) {
      notify.error('El monto al doctor supera el monto declarado de la orden');
      return;
    }
    setSaving(true);
    try {
      await orderGateway.billing(order.id, {
        doctorAmount,
        doctorAmountCurrency,
        billingExchangeRateId: rateId,
      });
      notify.success('Orden finalizada');
      onSaved();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo finalizar la orden'));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadFactura = async () => {
    setDownloadingFact(true);
    try {
      await downloadFacturacionXlsx(order);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo generar la factura'));
    } finally {
      setDownloadingFact(false);
    }
  };

  return (
    <div className="space-y-5">
      <FormSection
        title="Factura"
        description="Descargá la factura única con todos los tipos de servicio de la orden."
      >
        <button
          type="button"
          onClick={handleDownloadFactura}
          disabled={downloadingFact}
          className="rounded-lg border bg-card p-4 text-left hover:bg-accent transition-colors disabled:opacity-60 w-full sm:w-auto"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-md bg-success-soft text-success flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Factura</div>
              <div className="text-xs text-muted-foreground">
                Comprobante con todos los servicios + datos del titular y contratante.
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-brand-blue-strong">
            <Download className="w-3.5 h-3.5" />
            {downloadingFact ? 'Generando…' : 'Descargar XLSX'}
          </span>
        </button>
      </FormSection>

      <FormSection
        title="Liquidación"
        description="Asigná el monto al doctor/centro y revisá el cálculo de impuestos y ganancia neta."
      >
        <div className="grid sm:grid-cols-3 gap-x-5 gap-y-[18px]">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>
              Monto al {isDoctor ? 'doctor' : 'centro de atención'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <CurrencyAmountInput
              value={doctorAmount}
              onChange={(v) => setDoctorAmount(v)}
              currencyPrefix={doctorAmountCurrency}
              disabled={isFinalized}
            />
            {exceedsCap && (
              <p className="text-xs text-destructive">
                Excede el monto declarado de la orden ({priceAmount.toFixed(2)}{' '}
                {order.priceCurrency})
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              Moneda <span className="text-destructive">*</span>
            </Label>
            <Select
              value={doctorAmountCurrency}
              onValueChange={(v) => setDoctorAmountCurrency(v as DoctorAmountCurrency)}
              disabled={isFinalized}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!rateBs && (
          <p className="text-xs italic text-muted-foreground mt-3">
            Sin tasa de cambio activa para {order.priceCurrency}: cargar una en
            /exchange-rates antes de finalizar.
          </p>
        )}

        {isDoctor && (
          <div className="rounded-lg border bg-warning-soft/40 p-4 space-y-1.5 mt-4">
            <div className="text-[13px] font-semibold">
              Impuesto del doctor ({(taxRate * 100).toFixed(0)}%)
            </div>
            <div className="text-sm">
              {doctorAmount !== undefined ? (
                <>
                  {taxAmount.toFixed(2)} {doctorAmountCurrency}
                  {taxAmountBs !== null && doctorAmountCurrency !== 'BS' && (
                    <span className="text-muted-foreground">
                      {' '}
                      (Bs. {taxAmountBs.toFixed(2)})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {order.doctor?.isLegalEntity ? 'Persona jurídica' : 'Persona natural'} —
              retención al doctor, no costo de la empresa.
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-success-soft/40 p-4 space-y-1.5 mt-4">
          <div className="text-[13px] font-semibold">Ganancia neta empresa</div>
          <div className="text-sm">
            {netProfit !== null ? (
              <>
                {netProfit.toFixed(2)} {order.priceCurrency}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            priceAmount − doctorAmount (sin restar tax).
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={saving || isFinalized || !rateId || exceedsCap}
          >
            {saving
              ? 'Guardando...'
              : isFinalized
                ? 'Orden finalizada'
                : 'Finalizar orden'}
          </Button>
        </div>
      </FormSection>

      {/* Inline pagos: orden por pagar + orden por cobrar (si seguro) */}
      {isFinalized ? (
        <>
          <OrdenPorPagarSection order={order} onSaved={onSaved} />
          {order.type === 'insurance' ? (
            <OrdenPorCobrarSection order={order} onSaved={onSaved} />
          ) : null}
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Finalizá la orden para registrar el pago al{' '}
          {isDoctor ? 'doctor' : 'centro'}
          {order.type === 'insurance' ? ' y el cobro al seguro' : ''}.
        </p>
      )}
    </div>
  );
}

/** Sub-sección "Orden por pagar" — pago al doctor o centro. */
function OrdenPorPagarSection({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const orderCurrency: OrderCurrency = order.priceCurrency;
  const [account, setAccount] = useState<AccountsPayable | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<OrderPaymentValues[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountsPayableGateway.list({
        orderId: order.id,
        limit: 1,
      });
      setAccount(res.data[0] ?? null);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo cargar la orden por pagar'));
    } finally {
      setLoading(false);
    }
  }, [order.id]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent(orderCurrency);
        if (!cancelled) setCurrentRate(rate);
      } catch {
        if (!cancelled) setCurrentRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderCurrency]);

  const totalPayments = useMemo(() => {
    if (!currentRate) return 0;
    const lookup = (id: string): ExchangeRate | null =>
      id === currentRate.id ? currentRate : null;
    return payments.reduce(
      (sum, p) => sum + paymentInOrderCurrency(p, orderCurrency, lookup),
      0,
    );
  }, [payments, currentRate, orderCurrency]);

  const onRegister = async () => {
    if (!account) return;
    if (payments.length === 0) {
      notify.error('Registrá al menos un pago');
      return;
    }
    setSaving(true);
    try {
      await accountsPayableGateway.registerPayment({
        payableIds: [account.id],
        payments: payments.map((p) => ({
          type: p.type,
          paymentDate: p.paymentDate,
          referenceNumber: p.referenceNumber || undefined,
          bankCode: p.bankCode || undefined,
          accountNumber: p.accountNumber || undefined,
          exchangeRateId: p.exchangeRateId || undefined,
          amountCurrency: p.amountCurrency,
          amountValue: p.amountValue,
        })),
      });
      notify.success('Pago registrado');
      setPayments([]);
      await load();
      onSaved();
    } catch (err) {
      notify.fromError(err, 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSection
      title="Orden por pagar"
      description="Registrá el pago al doctor o centro de atención. Mismo componente de pagos usado en órdenes."
      headerAction={
        account?.status === 'paid' ? (
          <Badge className="bg-success-soft text-success border-success/30">
            Pagada
          </Badge>
        ) : (
          <Badge className="bg-warning-soft text-warning border-warning/30">
            No pagada
          </Badge>
        )
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando cuenta…</p>
      ) : !account ? (
        <p className="text-sm text-destructive">
          No se encontró la cuenta por pagar para esta orden.
        </p>
      ) : account.status === 'paid' ? (
        <p className="text-sm text-muted-foreground">
          Esta orden ya fue pagada
          {account.paidAt
            ? ` el ${new Date(account.paidAt).toLocaleDateString('es-VE')}`
            : ''}
          . Para ver detalles, ingresá a Cuentas por pagar.
        </p>
      ) : (
        <>
          <OrderPaymentForm
            payments={payments}
            onChange={setPayments}
            orderCurrency={orderCurrency}
            currentRate={currentRate}
          />
          {currentRate && (
            <div className="grid grid-cols-2 gap-3 text-sm mt-4">
              <div className="rounded-md border p-2 bg-muted/30">
                <div className="text-xs text-muted-foreground">Total pagos</div>
                <div className="font-mono">
                  {totalPayments.toFixed(2)} {orderCurrency}
                </div>
              </div>
              <div className="rounded-md border p-2 bg-muted/30">
                <div className="text-xs text-muted-foreground">
                  Tasa actual {currentRate.currency}
                </div>
                <div className="font-mono">
                  1 {currentRate.currency} ={' '}
                  {Number(currentRate.amountBs).toFixed(2)} Bs.
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end mt-4">
            <Button
              type="button"
              onClick={onRegister}
              disabled={saving || payments.length === 0 || !currentRate}
            >
              {saving ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </div>
        </>
      )}
    </FormSection>
  );
}

/** Sub-sección "Orden por cobrar" — cobro al seguro (sólo orden tipo insurance). */
function OrdenPorCobrarSection({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const orderCurrency: OrderCurrency = order.priceCurrency;
  const [account, setAccount] = useState<AccountsReceivable | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<OrderPaymentValues[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountsReceivableGateway.list({
        orderId: order.id,
        limit: 1,
      });
      setAccount(res.data[0] ?? null);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo cargar la orden por cobrar'));
    } finally {
      setLoading(false);
    }
  }, [order.id]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent(orderCurrency);
        if (!cancelled) setCurrentRate(rate);
      } catch {
        if (!cancelled) setCurrentRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderCurrency]);

  const totalPayments = useMemo(() => {
    if (!currentRate) return 0;
    const lookup = (id: string): ExchangeRate | null =>
      id === currentRate.id ? currentRate : null;
    return payments.reduce(
      (sum, p) => sum + paymentInOrderCurrency(p, orderCurrency, lookup),
      0,
    );
  }, [payments, currentRate, orderCurrency]);

  const onRegister = async () => {
    if (!account) return;
    if (payments.length === 0) {
      notify.error('Registrá al menos un cobro');
      return;
    }
    setSaving(true);
    try {
      await accountsReceivableGateway.registerCollection({
        receivableIds: [account.id],
        payments: payments.map((p) => ({
          type: p.type,
          paymentDate: p.paymentDate,
          referenceNumber: p.referenceNumber || undefined,
          bankCode: p.bankCode || undefined,
          accountNumber: p.accountNumber || undefined,
          exchangeRateId: p.exchangeRateId || undefined,
          amountCurrency: p.amountCurrency,
          amountValue: p.amountValue,
        })),
      });
      notify.success('Cobro registrado');
      setPayments([]);
      await load();
      onSaved();
    } catch (err) {
      notify.fromError(err, 'No se pudo registrar el cobro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSection
      title="Orden por cobrar"
      description="Registrá el cobro al seguro. Sin cap de monto."
      headerAction={
        account?.status === 'collected' ? (
          <Badge className="bg-success-soft text-success border-success/30">
            Cobrada
          </Badge>
        ) : (
          <Badge className="bg-warning-soft text-warning border-warning/30">
            No cobrada
          </Badge>
        )
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando cuenta…</p>
      ) : !account ? (
        <p className="text-sm text-destructive">
          No se encontró la cuenta por cobrar para esta orden.
        </p>
      ) : account.status === 'collected' ? (
        <p className="text-sm text-muted-foreground">
          Esta orden ya fue cobrada
          {account.collectedAt
            ? ` el ${new Date(account.collectedAt).toLocaleDateString('es-VE')}`
            : ''}
          . Para ver detalles, ingresá a Cuentas por cobrar.
        </p>
      ) : (
        <>
          <OrderPaymentForm
            payments={payments}
            onChange={setPayments}
            orderCurrency={orderCurrency}
            currentRate={currentRate}
          />
          {currentRate && (
            <div className="grid grid-cols-2 gap-3 text-sm mt-4">
              <div className="rounded-md border p-2 bg-muted/30">
                <div className="text-xs text-muted-foreground">Total cobros</div>
                <div className="font-mono">
                  {totalPayments.toFixed(2)} {orderCurrency}
                </div>
              </div>
              <div className="rounded-md border p-2 bg-muted/30">
                <div className="text-xs text-muted-foreground">
                  Tasa actual {currentRate.currency}
                </div>
                <div className="font-mono">
                  1 {currentRate.currency} ={' '}
                  {Number(currentRate.amountBs).toFixed(2)} Bs.
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end mt-4">
            <Button
              type="button"
              onClick={onRegister}
              disabled={saving || payments.length === 0 || !currentRate}
            >
              {saving ? 'Guardando…' : 'Registrar cobro'}
            </Button>
          </div>
        </>
      )}
    </FormSection>
  );
}
