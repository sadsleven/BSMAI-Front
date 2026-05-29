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
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { orderGateway } from '../../../infrastructure/orderGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import { creditsReceivableGateway } from '@/modules/credits-receivable/infrastructure/creditsReceivableGateway';
import type { AccountsPayable } from '@/modules/accounts-payable/domain/models/accountsPayable';
import type { AccountsReceivable } from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import type { CreditsReceivable } from '@/modules/credits-receivable/domain/models/creditsReceivable';
import {
  OrderPaymentForm,
  paymentInOrderCurrency,
} from '../OrderPaymentForm';
import { downloadFacturacionXlsx } from '../orderExcel';
import { downloadFacturacionPdf } from '../orderPdf';
import { taxRateFor, useTaxRates } from '@/lib/config/taxRates';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
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
type ProviderRow = {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  isLegalEntity?: boolean;
  serviceTypeIds: string[];
  serviceTypeNames: string[];
  breakdown: Array<{ stName: string; amount: number | null }>;
  /** Suma sugerida en priceCurrency. */
  suggested: number;
  amount: number | undefined;
  currency: DoctorAmountCurrency;
  manuallyEdited: boolean;
};

export function OrderBillingStep({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const { has } = usePermissions();
  const canSetProviderAmount = has(PERMISSIONS.ORDERS.SET_PROVIDER_AMOUNT);
  const priceAmount = Number(order.priceAmount);
  const isFinalized = order.status === 'finalized';

  const [rateBs, setRateBs] = useState<number | null>(
    order.billingExchangeRate ? Number(order.billingExchangeRate.amountBs) : null,
  );
  const [rateId, setRateId] = useState<string | null>(
    order.billingExchangeRateId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [downloadingFact, setDownloadingFact] = useState<null | 'xlsx' | 'pdf'>(null);

  // Filas por proveedor con sugerido + monto editable.
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggested(true);
    (async () => {
      // Agrupa filas OST por proveedor.
      type Group = {
        key: string;
        providerType: 'doctor' | 'care_center';
        providerId: string;
        providerName: string;
        rows: { serviceTypeId: string; serviceTypeName: string }[];
      };
      const groups = new Map<string, Group>();
      for (const ost of order.orderServiceTypes ?? []) {
        const id =
          ost.providerType === 'doctor' ? ost.doctorId : ost.careCenterId;
        if (!id) continue;
        const k = `${ost.providerType}:${id}`;
        if (!groups.has(k)) {
          const name =
            ost.providerType === 'doctor'
              ? `${ost.doctor?.firstName ?? ''} ${ost.doctor?.lastName ?? ''}`.trim() ||
                id
              : ost.careCenter?.businessName ?? id;
          groups.set(k, {
            key: k,
            providerType: ost.providerType,
            providerId: id,
            providerName: name,
            rows: [],
          });
        }
        groups.get(k)!.rows.push({
          serviceTypeId: ost.serviceTypeId,
          serviceTypeName: ost.serviceType?.name ?? ost.serviceTypeId,
        });
      }

      // Fetch full provider + persisted account amount per group.
      const ccy = order.priceCurrency;
      const built: ProviderRow[] = [];
      for (const g of groups.values()) {
        try {
          const full =
            g.providerType === 'doctor'
              ? await doctorGateway.getById(g.providerId)
              : await careCenterGateway.getById(g.providerId);
          const prices: ServicePriceRow[] =
            (full as { servicePrices?: ServicePriceRow[] }).servicePrices ?? [];
          const byST = new Map(prices.map((sp) => [sp.serviceTypeId, sp]));
          const breakdown = g.rows.map((r) => {
            const sp = byST.get(r.serviceTypeId);
            const v = sp
              ? ccy === 'USD'
                ? Number(sp.priceUsd)
                : Number(sp.priceEur)
              : NaN;
            return {
              stName: r.serviceTypeName,
              amount: Number.isFinite(v) && v > 0 ? v : null,
            };
          });
          const suggested = +breakdown
            .reduce((s, l) => s + (l.amount ?? 0), 0)
            .toFixed(2);

          // Si existe accounts_payable con monto persistido, prefill con eso.
          let amount: number | undefined = undefined;
          let currency: DoctorAmountCurrency = ccy;
          try {
            const list = await accountsPayableGateway.list({
              orderId: order.id,
              doctorId: g.providerType === 'doctor' ? g.providerId : undefined,
              careCenterId:
                g.providerType === 'care_center' ? g.providerId : undefined,
              limit: 1,
            });
            const acc = list.data[0];
            if (acc?.providerAmount && acc.providerAmountCurrency) {
              amount = Number(acc.providerAmount);
              currency = acc.providerAmountCurrency;
            }
          } catch {
            // ignorar
          }
          if (amount === undefined) {
            amount = suggested > 0 ? suggested : undefined;
          }

          const isLegal =
            g.providerType === 'doctor'
              ? !!(full as { isLegalEntity?: boolean }).isLegalEntity
              : undefined;

          built.push({
            key: g.key,
            providerType: g.providerType,
            providerId: g.providerId,
            providerName: g.providerName,
            isLegalEntity: isLegal,
            serviceTypeIds: g.rows.map((r) => r.serviceTypeId),
            serviceTypeNames: g.rows.map((r) => r.serviceTypeName),
            breakdown,
            suggested,
            amount,
            currency,
            manuallyEdited: false,
          });
        } catch {
          built.push({
            key: g.key,
            providerType: g.providerType,
            providerId: g.providerId,
            providerName: g.providerName,
            serviceTypeIds: g.rows.map((r) => r.serviceTypeId),
            serviceTypeNames: g.rows.map((r) => r.serviceTypeName),
            breakdown: g.rows.map((r) => ({ stName: r.serviceTypeName, amount: null })),
            suggested: 0,
            amount: undefined,
            currency: ccy,
            manuallyEdited: false,
          });
        }
      }
      if (!cancelled) setProviders(built);
      if (!cancelled) setLoadingSuggested(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

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

  // Conversión a moneda de la orden por fila.
  const convertToOrder = (amount: number, currency: DoctorAmountCurrency): number | null => {
    if (currency === order.priceCurrency) return amount;
    if (currency === 'BS') {
      if (!rateBs || rateBs <= 0) return null;
      return amount / rateBs;
    }
    return null; // sin tasa cruzada USD↔EUR
  };

  const totalInOrderCurrency = providers.reduce((s, p) => {
    if (p.amount === undefined) return s;
    const c = convertToOrder(p.amount, p.currency);
    return s + (c ?? 0);
  }, 0);
  const totalSuggested = providers.reduce((s, p) => s + p.suggested, 0);
  const exceedsCap = totalInOrderCurrency > priceAmount + 0.005;
  const netProfit = priceAmount - totalInOrderCurrency;

  const taxRates = useTaxRates();

  const updateProvider = (idx: number, patch: Partial<ProviderRow>) => {
    setProviders((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const onSubmit = async () => {
    if (providers.length === 0) {
      notify.error('La orden no tiene proveedores asignados');
      return;
    }
    if (providers.some((p) => p.amount === undefined || p.amount <= 0)) {
      notify.error('Cargá un monto > 0 para cada proveedor');
      return;
    }
    if (!rateId) {
      notify.error('No hay tasa de cambio activa para registrar la facturación');
      return;
    }
    if (exceedsCap) {
      notify.error('La suma de pagos supera el monto declarado de la orden');
      return;
    }
    setSaving(true);
    try {
      await orderGateway.billing(order.id, {
        providers: providers.map((p) => ({
          providerType: p.providerType,
          doctorId: p.providerType === 'doctor' ? p.providerId : undefined,
          careCenterId: p.providerType === 'care_center' ? p.providerId : undefined,
          amount: p.amount!,
          currency: p.currency,
        })),
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

  const handleDownloadFactura = async (fmt: 'xlsx' | 'pdf') => {
    setDownloadingFact(fmt);
    try {
      if (fmt === 'xlsx') await downloadFacturacionXlsx(order);
      else await downloadFacturacionPdf(order);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo generar la factura'));
    } finally {
      setDownloadingFact(null);
    }
  };

  return (
    <div className="space-y-5">
      <FormSection
        title="Factura"
        description="Descargá la factura única con todos los tipos de servicio de la orden, en Excel o PDF."
      >
        <div className="rounded-lg border bg-card p-4 flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-md bg-success-soft text-success flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-semibold">Factura</div>
            <div className="text-xs text-muted-foreground">
              Comprobante con todos los servicios + datos del titular y contratante.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDownloadFactura('xlsx')}
              disabled={downloadingFact !== null}
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingFact === 'xlsx' ? 'Generando…' : 'Excel'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDownloadFactura('pdf')}
              disabled={downloadingFact !== null}
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingFact === 'pdf' ? 'Generando…' : 'PDF'}
            </Button>
          </div>
        </div>
      </FormSection>

      {canSetProviderAmount ? (
      <FormSection
        title="Liquidación por proveedor"
        description="Asigná el monto a pagar a cada proveedor de la orden. Cada uno se factura por separado."
      >
        {loadingSuggested && providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Calculando montos sugeridos…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-destructive">
            La orden no tiene proveedores asignados.
          </p>
        ) : (
          <div className="space-y-4">
            {providers.map((p, idx) => {
              const showModified =
                p.amount !== undefined &&
                p.currency === order.priceCurrency &&
                Math.abs(p.amount - p.suggested) > 0.005;
              const taxRate =
                p.providerType === 'doctor'
                  ? taxRateFor(taxRates, !!p.isLegalEntity)
                  : 0;
              const taxAmount =
                p.providerType === 'doctor' && p.amount !== undefined
                  ? p.amount * taxRate
                  : 0;
              const missing = p.breakdown
                .filter((b) => b.amount === null)
                .map((b) => b.stName);
              return (
                <div
                  key={p.key}
                  className="rounded-lg border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {p.providerName}{' '}
                        <span className="text-xs text-muted-foreground font-normal">
                          ({p.providerType === 'doctor' ? 'Doctor' : 'Centro'})
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.serviceTypeNames.join(', ')}
                      </div>
                    </div>
                    {showModified && (
                      <Badge variant="outline" className="text-[10px]">
                        Monto modificado
                      </Badge>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-3 gap-x-5 gap-y-3">
                    <div className="sm:col-span-2 flex flex-col gap-1.5">
                      <Label className="text-xs">
                        Monto a pagar <span className="text-destructive">*</span>
                      </Label>
                      <CurrencyAmountInput
                        value={p.amount}
                        onChange={(v) =>
                          updateProvider(idx, { amount: v, manuallyEdited: true })
                        }
                        currencyPrefix={p.currency}
                        disabled={isFinalized}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Sugerido: {p.suggested.toFixed(2)} {order.priceCurrency}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        Moneda <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={p.currency}
                        onValueChange={(v) =>
                          updateProvider(idx, {
                            currency: v as DoctorAmountCurrency,
                          })
                        }
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

                  <details className="rounded border bg-muted/20 p-2 text-xs">
                    <summary className="cursor-pointer font-medium">
                      Desglose por servicio
                    </summary>
                    <ul className="mt-2 space-y-0.5">
                      {p.breakdown.map((l) => (
                        <li key={l.stName} className="flex justify-between">
                          <span>{l.stName}</span>
                          {l.amount !== null ? (
                            <span className="font-mono">
                              {l.amount.toFixed(2)} {order.priceCurrency}
                            </span>
                          ) : (
                            <span className="text-warning italic">Sin precio</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {missing.length > 0 && (
                      <p className="mt-2 text-warning">
                        El proveedor no tiene precio definido para{' '}
                        <strong>{missing.join(', ')}</strong>. Ingresá el monto manualmente.
                      </p>
                    )}
                  </details>

                  {p.providerType === 'doctor' && p.amount !== undefined && (
                    <div className="rounded border bg-warning-soft/40 p-2 text-xs">
                      <div className="font-semibold">
                        Impuesto del doctor ({(taxRate * 100).toFixed(0)}%)
                      </div>
                      <div>
                        {taxAmount.toFixed(2)} {p.currency}
                        <span className="ml-2 text-muted-foreground">
                          ({p.isLegalEntity ? 'Persona jurídica' : 'Persona natural'} —
                          retención, no costo de la empresa)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!rateBs && (
              <p className="text-xs italic text-muted-foreground">
                Sin tasa de cambio activa para {order.priceCurrency}: cargar una en
                /exchange-rates antes de finalizar.
              </p>
            )}

            <div className="rounded-lg border overflow-hidden">
              <div className="bg-[oklch(0.985_0.003_250)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Desglose por proveedor
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Proveedor</th>
                      <th className="text-right font-medium px-3 py-2">Sugerido</th>
                      <th className="text-right font-medium px-3 py-2">A pagar</th>
                      <th className="text-right font-medium px-3 py-2">Sugerido</th>
                      <th className="text-right font-medium px-3 py-2">Impuesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => {
                      const inOrder =
                        p.amount === undefined
                          ? null
                          : convertToOrder(p.amount, p.currency);
                      const delta =
                        inOrder === null ? null : inOrder - p.suggested;
                      const taxRate =
                        p.providerType === 'doctor'
                          ? taxRateFor(taxRates, !!p.isLegalEntity)
                          : 0;
                      const taxAmount =
                        p.providerType === 'doctor' && p.amount !== undefined
                          ? p.amount * taxRate
                          : null;
                      const conv =
                        p.amount !== undefined && p.currency !== order.priceCurrency;
                      return (
                        <tr key={p.key} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.providerName}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {p.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                              {' · '}
                              {p.serviceTypeIds.length} servicio
                              {p.serviceTypeIds.length === 1 ? '' : 's'}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {p.suggested.toFixed(2)} {order.priceCurrency}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {p.amount === undefined ? (
                              <span className="text-muted-foreground italic">—</span>
                            ) : (
                              <>
                                {p.amount.toFixed(2)} {p.currency}
                                {conv && (
                                  <div className="text-[10px] text-muted-foreground">
                                    ≈{' '}
                                    {inOrder === null
                                      ? 'sin tasa'
                                      : `${inOrder.toFixed(2)} ${order.priceCurrency}`}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 text-right font-mono',
                              delta !== null && delta > 0.005 && 'text-warning',
                              delta !== null && delta < -0.005 && 'text-success',
                            )}
                          >
                            {delta === null
                              ? '—'
                              : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${order.priceCurrency}`}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {taxAmount === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <>
                                {taxAmount.toFixed(2)} {p.currency}
                                <div className="text-[10px] text-muted-foreground">
                                  {(taxRate * 100).toFixed(0)}%{' '}
                                  {p.isLegalEntity ? 'jur.' : 'nat.'}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {totalSuggested.toFixed(2)} {order.priceCurrency}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono',
                          exceedsCap && 'text-destructive',
                        )}
                      >
                        {totalInOrderCurrency.toFixed(2)} {order.priceCurrency}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {(totalInOrderCurrency - totalSuggested >= 0 ? '+' : '') +
                          (totalInOrderCurrency - totalSuggested).toFixed(2)}{' '}
                        {order.priceCurrency}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">
                        retención
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm grid sm:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Monto declarado</div>
                <div className="font-mono">
                  {priceAmount.toFixed(2)} {order.priceCurrency}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sugerido total</div>
                <div className="font-mono">
                  {totalSuggested.toFixed(2)} {order.priceCurrency}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total a pagar</div>
                <div className={cn('font-mono', exceedsCap && 'text-destructive')}>
                  {totalInOrderCurrency.toFixed(2)} {order.priceCurrency}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Ganancia neta
                </div>
                <div className="font-mono">
                  {netProfit.toFixed(2)} {order.priceCurrency}
                </div>
              </div>
            </div>

            {exceedsCap && (
              <p className="text-xs text-destructive">
                La suma supera el monto declarado de la orden ({priceAmount.toFixed(2)}{' '}
                {order.priceCurrency}).
              </p>
            )}

            <div className="flex justify-end">
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
          </div>
        )}
      </FormSection>
      ) : (
        <FormSection
          title="Liquidación por proveedor"
          description="Asignación de montos a proveedores."
        >
          <p className="text-sm text-muted-foreground">
            No tenés permiso para asignar la liquidación a los proveedores
            {isFinalized ? '' : ' ni finalizar la orden'}.
          </p>
        </FormSection>
      )}

      {/* Inline pagos: orden por pagar + orden por cobrar (si seguro) */}
      {isFinalized ? (
        <>
          {providers.map((p) => (
            <OrdenPorPagarSection
              key={p.key}
              order={order}
              providerType={p.providerType}
              providerId={p.providerId}
              providerName={p.providerName}
              onSaved={onSaved}
            />
          ))}
          {order.type === 'insurance' ? (
            <OrdenPorCobrarSection order={order} onSaved={onSaved} />
          ) : null}
          {order.type === 'credit' ? (
            <CreditoPorCobrarSection order={order} onSaved={onSaved} />
          ) : null}
        </>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Finalizá la orden para registrar los pagos a los proveedores
          {order.type === 'insurance' ? ' y el cobro al seguro' : ''}
          {order.type === 'credit' ? ' y el cobro del crédito al titular' : ''}.
        </p>
      )}
    </div>
  );
}

/** Sub-sección "Orden por pagar" — pago a UN proveedor específico. */
function OrdenPorPagarSection({
  order,
  providerType,
  providerId,
  providerName,
  onSaved,
}: {
  order: Order;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
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
        doctorId: providerType === 'doctor' ? providerId : undefined,
        careCenterId: providerType === 'care_center' ? providerId : undefined,
        limit: 1,
      });
      setAccount(res.data[0] ?? null);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo cargar la orden por pagar'));
    } finally {
      setLoading(false);
    }
  }, [order.id, providerType, providerId]);
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
      title={`Orden por pagar — ${providerName}`}
      description={`Pago al ${providerType === 'doctor' ? 'doctor' : 'centro'}.`}
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

/** Sub-sección "Crédito por cobrar" — cobro al titular (sólo orden tipo credit). */
function CreditoPorCobrarSection({
  order,
  onSaved,
}: {
  order: Order;
  onSaved: () => void;
}) {
  const orderCurrency: OrderCurrency = order.priceCurrency;
  const [account, setAccount] = useState<CreditsReceivable | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<OrderPaymentValues[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await creditsReceivableGateway.list({
        orderId: order.id,
        limit: 1,
      });
      setAccount(res.data[0] ?? null);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo cargar el crédito por cobrar'));
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
      await creditsReceivableGateway.registerCollection({
        creditIds: [account.id],
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
      title="Crédito por cobrar"
      description="Registrá los pagos del titular hasta completar el crédito."
      headerAction={
        account?.status === 'collected' || account?.status === 'overcollected' ? (
          <Badge className="bg-success-soft text-success border-success/30">
            {account.status === 'overcollected' ? 'Sobre-cobrado' : 'Cobrado'}
          </Badge>
        ) : account?.status === 'partially_collected' ? (
          <Badge className="bg-brand-cyan-soft text-brand-blue-strong border-brand-cyan/30">
            Parcial
          </Badge>
        ) : (
          <Badge className="bg-warning-soft text-warning border-warning/30">
            No cobrado
          </Badge>
        )
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando crédito…</p>
      ) : !account ? (
        <p className="text-sm text-destructive">
          No se encontró el crédito por cobrar para esta orden.
        </p>
      ) : account.status === 'collected' || account.status === 'overcollected' ? (
        <p className="text-sm text-muted-foreground">
          Este crédito ya fue saldado
          {account.collectedAt
            ? ` el ${new Date(account.collectedAt).toLocaleDateString('es-VE')}`
            : ''}
          . Para ver detalles, ingresá a Créditos por cobrar.
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
