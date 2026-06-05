import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileSpreadsheet, HandCoins, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { FormSection } from '@/components/ui/form-section';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { orderGateway } from '../../../infrastructure/orderGateway';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { downloadFacturacionXlsx } from '../orderExcel';
import { downloadFacturacionPdf } from '../orderPdf';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import type { Order } from '../../../domain/models/order';

/**
 * Paso 4 — Facturación y liquidación (USD-only).
 *
 * - Factura única con todos los STs.
 * - Asigna `doctorAmount` USD por proveedor (bruto); cap ≤ priceAmount.
 * - Retención SENIAT NO se calcula aquí; se genera al registrar el pago AP.
 * - `billingExchangeRateId` snapshot tasa USD/Bs al facturar.
 */
type ProviderRow = {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  serviceTypeIds: string[];
  serviceTypeNames: string[];
  breakdown: Array<{ stName: string; amount: number | null }>;
  /** Suma sugerida USD. */
  suggested: number;
  amount: number | undefined;
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

  const [usdRate, setUsdRate] = useState<ExchangeRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingFact, setDownloadingFact] = useState<null | 'xlsx' | 'pdf'>(null);

  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggested(true);
    (async () => {
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
            const v = sp ? Number(sp.priceUsd) : NaN;
            return {
              stName: r.serviceTypeName,
              amount: Number.isFinite(v) && v > 0 ? v : null,
            };
          });
          const suggested = +breakdown
            .reduce((s, l) => s + (l.amount ?? 0), 0)
            .toFixed(2);

          let amount: number | undefined = undefined;
          try {
            const list = await accountsPayableGateway.list({
              orderId: order.id,
              doctorId: g.providerType === 'doctor' ? g.providerId : undefined,
              careCenterId:
                g.providerType === 'care_center' ? g.providerId : undefined,
              limit: 1,
            });
            const acc = list.data[0];
            if (acc?.providerAmount) {
              amount = Number(acc.providerAmount);
            }
          } catch {
            // ignorar
          }
          if (amount === undefined) {
            amount = suggested > 0 ? suggested : undefined;
          }

          built.push({
            key: g.key,
            providerType: g.providerType,
            providerId: g.providerId,
            providerName: g.providerName,
            serviceTypeIds: g.rows.map((r) => r.serviceTypeId),
            serviceTypeNames: g.rows.map((r) => r.serviceTypeName),
            breakdown,
            suggested,
            amount,
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
    if (usdRate) return;
    let cancelled = false;
    (async () => {
      try {
        const rate = await exchangeRateGateway.getCurrent('USD');
        if (!cancelled) setUsdRate(rate);
      } catch {
        // sin tasa actual
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usdRate]);

  const totalUsd = providers.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalSuggested = providers.reduce((s, p) => s + p.suggested, 0);
  const exceedsCap = totalUsd > priceAmount + 0.005;
  const netProfit = priceAmount - totalUsd;

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
    if (!usdRate?.id) {
      notify.error('No hay tasa USD activa para registrar la facturación');
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
        })),
        billingExchangeRateId: usdRate.id,
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
        description="Asigná el monto USD a pagar a cada proveedor. Cada uno se factura por separado."
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
                Math.abs(p.amount - p.suggested) > 0.005;
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

                  <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        Monto a pagar <span className="text-destructive">*</span>
                      </Label>
                      <CurrencyAmountInput
                        value={p.amount}
                        onChange={(v) =>
                          updateProvider(idx, { amount: v, manuallyEdited: true })
                        }
                        currencyPrefix="USD"
                        disabled={isFinalized}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Sugerido: {formatMoney(p.suggested)} USD
                      </p>
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
                              {formatMoney(l.amount)} USD
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

                </div>
              );
            })}

            {!usdRate && (
              <p className="text-xs italic text-muted-foreground">
                Sin tasa USD activa: cargar una en /exchange-rates antes de finalizar.
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
                      <th className="text-right font-medium px-3 py-2">A pagar (bruto)</th>
                      <th className="text-right font-medium px-3 py-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => {
                      const delta =
                        p.amount === undefined ? null : p.amount - p.suggested;
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
                            {formatMoney(p.suggested)} USD
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {p.amount === undefined ? (
                              <span className="text-muted-foreground italic">—</span>
                            ) : (
                              <>{formatMoney(p.amount)} USD</>
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
                              : `${delta > 0 ? '+' : ''}${formatMoney(delta)} USD`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatMoney(totalSuggested)} USD
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono',
                          exceedsCap && 'text-destructive',
                        )}
                      >
                        {formatMoney(totalUsd)} USD
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {(totalUsd - totalSuggested >= 0 ? '+' : '') +
                          formatMoney(totalUsd - totalSuggested)}{' '}
                        USD
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm grid sm:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Monto declarado</div>
                <div className="font-mono">{formatMoney(priceAmount)} USD</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sugerido total</div>
                <div className="font-mono">{formatMoney(totalSuggested)} USD</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total a pagar</div>
                <div className={cn('font-mono', exceedsCap && 'text-destructive')}>
                  {formatMoney(totalUsd)} USD
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ganancia neta</div>
                <div className="font-mono">{formatMoney(netProfit)} USD</div>
              </div>
            </div>

            {exceedsCap && (
              <p className="text-xs text-destructive">
                La suma supera el monto declarado de la orden ({formatMoney(priceAmount)} USD).
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onSubmit}
                disabled={saving || isFinalized || !usdRate?.id || exceedsCap}
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

      {isFinalized ? (
        <FormSection
          title="Próximos pasos"
          description="Registrá pagos y cobros desde sus respectivas secciones."
        >
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => {
              const params = new URLSearchParams();
              params.set('search', order.orderNumber);
              if (p.providerType === 'doctor') params.set('doctorId', p.providerId);
              else params.set('careCenterId', p.providerId);
              return (
                <Link key={p.key} to={`/accounts-payable?${params.toString()}`}>
                  <Button type="button" variant="outline">
                    <Wallet className="w-4 h-4 mr-1.5" />
                    Ir a Cuentas por pagar — {p.providerName}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              );
            })}
            {order.type === 'insurance' ||
            order.type === 'credit' ||
            order.type === 'cashea' ? (
              <Link
                to={`/accounts-receivable?search=${encodeURIComponent(order.orderNumber)}`}
              >
                <Button type="button" variant="outline">
                  <HandCoins className="w-4 h-4 mr-1.5" />
                  Ir a Cuentas por cobrar
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            ) : null}
          </div>
        </FormSection>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Finalizá la orden para registrar los pagos a los proveedores
          {order.type === 'insurance' ? ' y el cobro al seguro' : ''}
          {order.type === 'credit' ? ' y el cobro del crédito al titular' : ''}
          {order.type === 'cashea' ? ' y el cobro vía Cashea' : ''}.
        </p>
      )}
    </div>
  );
}
