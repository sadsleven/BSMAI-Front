import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Download,
  FileSpreadsheet,
  HandCoins,
  ListTree,
  Layers,
  Minus,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FormSection } from '@/components/ui/form-section';
import { FormSwitch } from '@/components/ui/form-switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format/money';
import { formatDateOnly, localTodayIso } from '@/lib/dates';
import { orderGateway } from '../../../infrastructure/orderGateway';
import { useRatesByCurrency } from '@/modules/exchange-rates/presentation/hooks/useUsdRates';
import { UsdRateSelect } from '@/modules/exchange-rates/presentation/components/UsdRateSelect';
import type { ExchangeRate } from '@/modules/exchange-rates/domain/models/exchangeRate';
import {
  dominantPaymentRate,
  downloadFacturacionXlsx,
  providerInternalNumber,
} from '../orderExcel';
import { downloadFacturacionPdf } from '../orderPdf';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import type { ServicePriceRow } from '@/lib/types/servicePrice';
import type {
  InvoiceableOrder,
  InvoiceNumberAvailability,
  Order,
  OrderInvoice,
} from '../../../domain/models/order';
import {
  activeInvoice,
  deriveControlNumber,
  formatInvoiceNumber,
  orderUserDisplayName,
  otherCoveredOrders,
} from '../../../domain/models/order';
import { OrderInvoiceCancelModal } from '../OrderInvoiceCancelModal';

/**
 * Paso 4 — Facturación y liquidación (USD-only).
 *
 * - Factura única con todos los STs.
 * - Asigna `doctorAmount` USD por proveedor (bruto); cap ≤ priceAmount.
 * - Retención SENIAT NO se calcula aquí; se genera al registrar el pago AP.
 * - Tasa USD/Bs de la factura **seleccionable**: se imprime en el documento,
 *   convierte los brutos de CxP/retenciones y, en seguros no indexados, fija en
 *   bolívares la cuenta por cobrar (viaja como `billingExchangeRateId`).
 */
type ProviderRow = {
  key: string;
  providerType: 'doctor' | 'care_center';
  providerId: string;
  providerName: string;
  serviceTypeIds: string[];
  serviceTypeNames: string[];
  breakdown: Array<{
    stName: string;
    /** Cantidad del ST en la orden (≥1). */
    qty: number;
    /** Precio unitario USD del proveedor, o null si no tiene precio. */
    unit: number | null;
    /** unit × qty, o null si no hay precio definido. */
    amount: number | null;
  }>;
  /** Suma sugerida USD (unit × qty por ST). */
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
  const canBilling = has(PERMISSIONS.ORDERS.STAGE_BILLING);
  const priceAmount = Number(order.priceAmount);
  const isFinalized = order.status === 'finalized';

  // Tasa de la factura: seleccionable. Por defecto la tasa con la que más se
  // pagó en bolívares (contado/cashea) y, si no hubo pagos en Bs, la más
  // reciente vigente. En seguros no indexados esta misma tasa es la que fija en
  // bolívares la cuenta por cobrar (el campo que antes vivía en el Paso 1).
  const { rates: usdRates, currentRateId } = useRatesByCurrency('USD');
  // `null` = sin elección explícita todavía; el id efectivo se deriva abajo.
  const [pickedRateId, setPickedRateId] = useState<string | null>(
    order.invoiceExchangeRateId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [downloadingFact, setDownloadingFact] = useState<null | 'xlsx' | 'pdf'>(null);

  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  // Errores de monto visibles sólo tras intentar finalizar; se auto-limpian
  // al corregir el monto (derivados de `p.amount`, sin estado por fila).
  const [amountErrorsVisible, setAmountErrorsVisible] = useState(false);
  // Factura vigente de la orden (null si nunca se emitió o si se anuló).
  const invoiceActive = useMemo(() => activeInvoice(order), [order]);
  /** Orden facturada y con factura vigente: los campos quedan fijos. */
  const invoiceLocked = isFinalized && !!invoiceActive;
  /** Orden finalizada cuya factura se anuló: puede emitir una nueva. */
  const canIssueInvoice = isFinalized && !invoiceActive;

  // N° de factura como ENTERO (se imprime con ceros a la izquierda). El N° de
  // control NO se captura: se deriva (número + 50, con dos ceros delante).
  const [invoiceNumber, setInvoiceNumber] = useState<number | undefined>(
    invoiceActive?.number != null ? Number(invoiceActive.number) : undefined,
  );
  const [numberCheck, setNumberCheck] =
    useState<InvoiceNumberAvailability | null>(null);
  const [numberChecking, setNumberChecking] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<OrderInvoice | null>(
    null,
  );
  // Fecha impresa en la factura: por defecto HOY (si ya hay factura vigente, la suya).
  const [invoiceDate, setInvoiceDate] = useState<string>(
    invoiceActive?.invoiceDate ?? localTodayIso(),
  );
  // ¿La factura imprime la fila "Tasa de cambio BCV"? Sólo se elige en órdenes
  // de seguro; por defecto la regla de siempre (no sale si la tasa es fija).
  const isInsurance = order.type === 'insurance';
  // Emitir factura: obligatorio en seguro; en contado / crédito / cashea es
  // opcional y viene apagado (hay que activarlo aquí, en el Paso 4).
  const [generateInvoice, setGenerateInvoice] = useState<boolean>(
    isInsurance || !!invoiceActive,
  );
  /** ¿Esta finalización emite factura? */
  const invoiceEnabled = isInsurance || generateInvoice;
  /**
   * Campos fiscales visibles: cuando se va a emitir la factura y también en
   * órdenes ya finalizadas (allí sirven para emitir una factura nueva).
   */
  const showInvoiceFields = invoiceEnabled || isFinalized;
  /** La orden nunca tuvo factura (se finalizó sin ella). */
  const neverInvoiced = (order.invoices ?? []).length === 0;
  /**
   * Factura AGRUPADA: otras órdenes finalizadas del mismo contratante que salen
   * en esta misma factura (el paciente atendido varias veces que pide un solo
   * documento). No toca cuentas por cobrar ni por pagar: la factura es sólo el
   * comprobante hacia el cliente.
   */
  const [candidates, setCandidates] = useState<InvoiceableOrder[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [groupedIds, setGroupedIds] = useState<string[]>([]);
  /** Órdenes que ya quedaron agrupadas en la factura vigente (sólo lectura). */
  const alreadyGrouped = useMemo(
    () => (invoiceActive ? otherCoveredOrders(invoiceActive, order.id) : []),
    [invoiceActive, order.id],
  );

  const [showRate, setShowRate] = useState<boolean>(
    invoiceActive?.showExchangeRate ??
      order.invoiceShowExchangeRate ??
      !order.useFixedRate,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSuggested(true);
      type Group = {
        key: string;
        providerType: 'doctor' | 'care_center';
        providerId: string;
        providerName: string;
        rows: { serviceTypeId: string; serviceTypeName: string; qty: number }[];
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
          serviceTypeName:
            ost.customName?.trim() || ost.serviceType?.name || ost.serviceTypeId,
          qty: Math.max(1, Math.trunc(ost.quantity ?? 1)),
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
            const unit = Number.isFinite(v) && v > 0 ? v : null;
            return {
              stName: r.serviceTypeName,
              qty: r.qty,
              unit,
              amount: unit !== null ? +(unit * r.qty).toFixed(2) : null,
            };
          });
          const suggested = +breakdown
            .reduce((s, l) => s + (l.amount ?? 0), 0)
            .toFixed(2);

          // Prefill desde la orden interna del proveedor (si ya fue facturada),
          // sino la suma sugerida. El BE recalcula al finalizar.
          let amount: number | undefined = undefined;
          const internal = (order.internalOrders ?? []).find(
            (io) =>
              io.providerType === g.providerType &&
              (g.providerType === 'doctor'
                ? io.doctorId === g.providerId
                : io.careCenterId === g.providerId),
          );
          if (internal?.providerAmountUsd != null) {
            amount = Number(internal.providerAmountUsd);
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
            serviceTypeNames: g.rows.map((r) =>
              r.qty > 1 ? `${r.serviceTypeName} (x${r.qty})` : r.serviceTypeName,
            ),
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
            serviceTypeNames: g.rows.map((r) =>
              r.qty > 1 ? `${r.serviceTypeName} (x${r.qty})` : r.serviceTypeName,
            ),
            breakdown: g.rows.map((r) => ({
              stName: r.serviceTypeName,
              qty: r.qty,
              unit: null,
              amount: null,
            })),
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

  // Prefill del N° de factura: el último disponible (el mayor emitido + 1).
  useEffect(() => {
    if (invoiceNumber !== undefined) return;
    let cancelled = false;
    orderGateway
      .invoiceNumberAvailability({})
      .then((res) => {
        if (!cancelled) setInvoiceNumber(res.suggestion);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // Disponibilidad en vivo (debounce 350ms). El BE re-valida al guardar: esto
  // es sólo feedback mientras el usuario mueve el número.
  useEffect(() => {
    const n = invoiceNumber;
    // Sin número válido no hay nada que consultar: el veredicto viejo se
    // descarta solo (se compara contra el número actual).
    if (n === undefined || !Number.isFinite(n) || n < 1) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setNumberChecking(true);
      orderGateway
        .invoiceNumberAvailability({ number: n, orderId: order.id })
        .then((res) => !cancelled && setNumberCheck(res))
        .catch(() => !cancelled && setNumberCheck(null))
        .finally(() => !cancelled && setNumberChecking(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invoiceNumber, order.id]);

  // Veredicto sólo si la respuesta corresponde al número actual.
  const numberAvailable =
    numberCheck && numberCheck.number === invoiceNumber
      ? numberCheck.available
      : null;
  const invoiceNumberText = invoiceNumber
    ? formatInvoiceNumber(invoiceNumber)
    : '';
  const controlNumberText = invoiceNumber
    ? deriveControlNumber(invoiceNumber)
    : '';
  const invoiceNumberOk =
    invoiceNumber !== undefined && numberAvailable !== false;

  /**
   * Tasa dominante en bolívares de los pagos del Paso 1 (contado/cashea). Null
   * cuando la orden no se pagó en Bs (seguro, crédito).
   */
  const dominantRate = useMemo(() => dominantPaymentRate(order), [order]);

  /**
   * Opciones del selector: las tasas USD activas + las que la orden ya
   * referencia (pago viejo, tasa fija, facturación previa) aunque estén
   * deshabilitadas, para que la seleccionada siempre se muestre.
   */
  const rateOptions = useMemo<ExchangeRate[]>(() => {
    const byId = new Map(usdRates.map((r) => [r.id, r]));
    const extras = [
      order.invoiceExchangeRate,
      order.fixedExchangeRate,
      order.billingExchangeRate,
      ...(order.payments ?? []).map((p) => p.exchangeRate),
    ];
    for (const e of extras) {
      if (!e || e.currency !== 'USD' || byId.has(e.id)) continue;
      byId.set(e.id, {
        id: e.id,
        currency: 'USD',
        amountBs: String(e.amountBs),
        effectiveDate: e.effectiveDate ?? '',
        isActive: true,
      });
    }
    return [...byId.values()].sort((a, b) =>
      a.effectiveDate < b.effectiveDate ? 1 : -1,
    );
  }, [usdRates, order]);

  // Tasa efectiva: la elegida (o la ya guardada) y, en su defecto, la dominante
  // de los pagos en bolívares; si la orden no se pagó en Bs, la más reciente.
  const invoiceRateId = pickedRateId ?? dominantRate?.id ?? currentRateId ?? '';

  const invoiceRate = rateOptions.find((r) => r.id === invoiceRateId) ?? null;
  const invoiceRateBs = invoiceRate ? Number(invoiceRate.amountBs) || 0 : 0;

  const totalUsd = providers.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalSuggested = providers.reduce((s, p) => s + p.suggested, 0);
  const exceedsCap = totalUsd > priceAmount + 0.005;
  const netProfit = priceAmount - totalUsd;

  // Candidatas a agruparse: sólo hace falta cuando esta pantalla va a EMITIR
  // la factura (no si ya está emitida ni si la orden se finaliza sin factura).
  // Aplica siempre que esta pantalla pueda EMITIR la factura: al finalizar
  // (switch "Generar factura" encendido, o seguro) y también en una orden ya
  // finalizada que quedó sin factura — el caso típico del paciente que vuelve
  // después a pedirla por varias atenciones.
  const canGroupInvoice =
    canBilling && !invoiceLocked && (invoiceEnabled || canIssueInvoice);
  useEffect(() => {
    if (!canGroupInvoice) return;
    let cancelled = false;
    void (async () => {
      setLoadingCandidates(true);
      try {
        const rows = await orderGateway.invoiceableOrders(order.id);
        if (!cancelled) setCandidates(rows);
      } catch {
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canGroupInvoice, order.id]);

  const toggleGrouped = (id: string) => {
    setGroupedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  /**
   * Selección efectiva: sólo las que siguen siendo candidatas (otra sesión pudo
   * facturarlas mientras tanto) y sólo si esta pantalla va a emitir la factura.
   * El BE rechazaría las demás.
   */
  const groupedSelection = useMemo(
    () =>
      canGroupInvoice
        ? groupedIds.filter((id) => candidates.some((c) => c.id === id))
        : [],
    [canGroupInvoice, groupedIds, candidates],
  );

  /** Total USD de la factura: esta orden + las agrupadas seleccionadas. */
  const groupedTotalUsd = useMemo(() => {
    const extra = candidates
      .filter((c) => groupedSelection.includes(c.id))
      .reduce((acc, c) => acc + (Number(c.priceAmount) || 0), 0);
    return priceAmount + extra;
  }, [candidates, groupedSelection, priceAmount]);

  /**
   * Órdenes agrupadas completas, para armar el documento: las seleccionadas
   * mientras se emite, o las ya agrupadas si la factura está emitida.
   */
  const loadGroupedOrders = async (): Promise<Order[]> => {
    const ids = invoiceLocked
      ? alreadyGrouped.map((o) => o.id)
      : groupedSelection;
    if (!ids.length) return [];
    return Promise.all(ids.map((id) => orderGateway.getById(id)));
  };

  const updateProvider = (idx: number, patch: Partial<ProviderRow>) => {
    setProviders((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const onSubmit = async () => {
    if (providers.length === 0) {
      notify.error('La orden no tiene proveedores asignados');
      return;
    }
    const invalidAmountProviders = providers.filter(
      (p) => p.amount === undefined || p.amount <= 0,
    );
    if (invalidAmountProviders.length > 0) {
      setAmountErrorsVisible(true);
      notify.error(
        invalidAmountProviders.length === 1
          ? `Ingresa un monto a pagar mayor que cero para ${invalidAmountProviders[0].providerName}`
          : `Ingresa un monto a pagar mayor que cero para: ${invalidAmountProviders
              .map((p) => p.providerName)
              .join(', ')}`,
      );
      return;
    }
    if (!invoiceRateId) {
      notify.error('Selecciona la tasa de cambio de la factura');
      return;
    }
    if (exceedsCap) {
      notify.error('La suma de pagos supera el monto declarado de la orden');
      return;
    }
    if (invoiceEnabled) {
      if (invoiceNumber === undefined) {
        notify.error('Ingresa el número de factura');
        return;
      }
      if (numberAvailable === false) {
        notify.error(
          numberCheck?.cancelled
            ? 'Ese número ya se usó en una factura anulada: elige otro'
            : 'Ese número de factura ya está en uso',
        );
        return;
      }
      if (!invoiceDate) {
        notify.error('Selecciona la fecha de la factura');
        return;
      }
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
        billingExchangeRateId: invoiceRateId,
        generateInvoice: invoiceEnabled,
        ...(invoiceEnabled ? { invoiceNumber, invoiceDate } : {}),
        ...(invoiceEnabled && groupedSelection.length
          ? { coveredOrderIds: groupedSelection }
          : {}),
        ...(isInsurance ? { showExchangeRate: showRate } : {}),
      });
      notify.success(
        invoiceEnabled ? 'Orden finalizada' : 'Orden finalizada sin factura',
      );
      onSaved();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo finalizar la orden'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Emite una factura NUEVA en una orden ya finalizada cuya factura vigente se
   * anuló. No toca la liquidación por proveedor ni los lotes de CxP/CxC.
   */
  const handleIssueInvoice = async () => {
    if (invoiceNumber === undefined) {
      notify.error('Ingresa el número de factura');
      return;
    }
    if (numberAvailable === false) {
      notify.error('Ese número de factura ya se usó: elige otro');
      return;
    }
    if (!invoiceDate) {
      notify.error('Selecciona la fecha de la factura');
      return;
    }
    setIssuing(true);
    try {
      await orderGateway.issueInvoice(order.id, {
        invoiceNumber,
        invoiceDate,
        ...(groupedSelection.length
          ? { coveredOrderIds: groupedSelection }
          : {}),
        ...(isInsurance ? { showExchangeRate: showRate } : {}),
        ...(invoiceRateId ? { exchangeRateId: invoiceRateId } : {}),
      });
      notify.success('Factura emitida');
      onSaved();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo emitir la factura'));
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadFactura = async (fmt: 'xlsx' | 'pdf') => {
    setDownloadingFact(fmt);
    try {
      // La fecha y la tasa elegidas mandan aunque la orden todavía no esté
      // finalizada: la descarga previa muestra la factura tal como quedará.
      const doc: Order = {
        ...order,
        invoiceDate: invoiceDate || order.invoiceDate,
        // El nombre del archivo y el documento salen con el número elegido.
        invoiceNumber: invoiceNumberText || order.invoiceNumber,
        controlNumber: controlNumberText || order.controlNumber,
        ...(isInsurance ? { invoiceShowExchangeRate: showRate } : {}),
        ...(invoiceRate
          ? {
              invoiceExchangeRateId: invoiceRate.id,
              invoiceExchangeRate: {
                id: invoiceRate.id,
                currency: invoiceRate.currency,
                amountBs: invoiceRate.amountBs,
                effectiveDate: invoiceRate.effectiveDate,
              },
            }
          : {}),
      };
      // La factura agrupada lista también los servicios de las otras órdenes.
      const grouped = await loadGroupedOrders();
      if (fmt === 'xlsx') await downloadFacturacionXlsx(doc, grouped);
      else await downloadFacturacionPdf(doc, grouped);
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
        description={
          invoiceEnabled
            ? 'Descarga la factura única con todos los tipos de servicio de la orden, en Excel o PDF.'
            : 'Esta orden puede finalizarse sin factura. Activa la factura si necesitas emitirla.'
        }
      >
        {!isInsurance && !isFinalized ? (
          <div className="rounded-lg border bg-card p-3 mb-4">
            <FormSwitch
              id="generateInvoice"
              label="Generar factura"
              description="En órdenes de contado, crédito y cashea la factura es opcional. Actívala para asignarle número y fecha; si la dejas apagada, la orden se finaliza sin factura y puedes emitirla después desde este mismo paso."
              checked={generateInvoice}
              onCheckedChange={setGenerateInvoice}
            />
          </div>
        ) : null}

        {showInvoiceFields ? (
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
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px] mt-4">
          {showInvoiceFields ? (
          <>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceNumber">
              Número de factura <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Número anterior"
                disabled={invoiceLocked || (invoiceNumber ?? 1) <= 1}
                onClick={() =>
                  setInvoiceNumber((v) => Math.max(1, (v ?? 1) - 1))
                }
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <Input
                id="invoiceNumber"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                className="max-w-[140px] text-center font-mono"
                disabled={invoiceLocked}
                value={invoiceNumber ?? ''}
                onChange={(e) => {
                  const rawValue = e.target.value.trim();
                  if (!rawValue) {
                    setInvoiceNumber(undefined);
                    return;
                  }
                  const n = Math.trunc(Number(rawValue));
                  setInvoiceNumber(Number.isFinite(n) && n > 0 ? n : undefined);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Número siguiente"
                disabled={invoiceLocked}
                onClick={() => setInvoiceNumber((v) => (v ?? 0) + 1)}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap min-h-[18px]">
              {numberChecking ? (
                <span className="text-xs text-muted-foreground">
                  Verificando disponibilidad…
                </span>
              ) : numberAvailable === true ? (
                <span className="text-xs text-success font-medium">
                  Disponible
                </span>
              ) : numberAvailable === false ? (
                <>
                  <span className="text-xs text-destructive font-medium">
                    {numberCheck?.cancelled
                      ? 'Ya se usó en una factura anulada'
                      : `Ya está en uso${
                          numberCheck?.usedByOrderNumber
                            ? ` (orden N° ${numberCheck.usedByOrderNumber})`
                            : ''
                        }`}
                  </span>
                  {!invoiceLocked && numberCheck?.nextFree ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoiceNumber(numberCheck.nextFree)}
                    >
                      Usar {formatInvoiceNumber(numberCheck.nextFree)}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Se imprime como{' '}
              <span className="font-mono font-semibold text-foreground">
                {invoiceNumberText || '—'}
              </span>
              . Los números no se reutilizan, tampoco los de facturas anuladas.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="controlNumber">Número de control</Label>
            <Input
              id="controlNumber"
              value={controlNumberText}
              readOnly
              disabled
              className="font-mono"
              placeholder="—"
            />
            <p className="text-xs text-muted-foreground">
              Se calcula solo: número de factura + 50, con dos ceros delante.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">
              Fecha de la factura <span className="text-destructive">*</span>
            </Label>
            <DatePicker
              id="invoiceDate"
              value={invoiceDate || undefined}
              onChange={(v) => setInvoiceDate(v ?? '')}
              disabled={invoiceLocked}
              invalid={!invoiceDate}
            />
            <p className="text-xs text-muted-foreground">
              Es la fecha que se imprime en la factura. Por defecto es hoy.
            </p>
          </div>
          </>
          ) : null}
          <div className="space-y-1.5">
            <Label>
              {invoiceEnabled ? 'Tasa de cambio de la factura' : 'Tasa de cambio'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <UsdRateSelect
              rates={rateOptions}
              selectedId={invoiceRateId}
              currentRateId={currentRateId}
              onSelect={setPickedRateId}
              disabled={invoiceLocked}
              lockNote={
                invoiceLocked
                  ? 'La orden ya está facturada: la tasa quedó fija.'
                  : undefined
              }
              label="Tasa USD/Bs de la factura"
            />
            <p className="text-xs text-muted-foreground">
              {order.useFixedRate
                ? 'Con esta tasa se imprime la factura y queda fija en bolívares la cuenta por cobrar del seguro no indexado.'
                : !invoiceEnabled
                  ? 'Convierte a bolívares los montos de cuentas por pagar, retenciones y reportes.'
                  : dominantRate
                    ? 'Por defecto, la tasa con la que más se pagó en bolívares.'
                    : 'Por defecto, la tasa más reciente vigente.'}
            </p>
            {invoiceEnabled && invoiceRateBs > 0 && priceAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Total de la factura:{' '}
                <span className="font-mono font-semibold text-foreground">
                  {formatMoney(priceAmount * invoiceRateBs)} Bs
                </span>
              </p>
            )}
          </div>
          {isInsurance ? (
            <div className="sm:col-span-2 rounded-lg border bg-card p-3">
              <FormSwitch
                id="invoiceShowExchangeRate"
                label="Mostrar la tasa de cambio en la factura"
                description={
                  <>
                    Imprime la fila «Tasa de cambio BCV» en el Excel y el PDF.
                    Por defecto{' '}
                    {order.useFixedRate
                      ? 'viene apagado: el seguro es no indexado y su cuenta por cobrar ya quedó fija en bolívares.'
                      : 'viene encendido: el seguro es indexado.'}
                  </>
                }
                checked={showRate}
                onCheckedChange={setShowRate}
                disabled={invoiceLocked}
              />
            </div>
          ) : null}
        </div>
        {canGroupInvoice && (loadingCandidates || candidates.length > 0) ? (
          <div className="mt-4 rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  Agrupar otras órdenes en esta factura
                </div>
                <p className="text-xs text-muted-foreground">
                  Órdenes ya finalizadas del mismo contratante que todavía no
                  tienen factura. Sus servicios salen en este mismo documento,
                  cada uno con su N° de orden. No cambia nada en cuentas por
                  cobrar ni por pagar.
                </p>
              </div>
            </div>

            {loadingCandidates ? (
              <p className="text-sm text-muted-foreground">
                Buscando órdenes que se puedan agrupar…
              </p>
            ) : (
              <>
                <ul className="divide-y rounded-lg border overflow-hidden">
                  {candidates.map((c) => {
                    const checked = groupedIds.includes(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          htmlFor={`grouped-${c.id}`}
                          className={cn(
                            'flex items-start gap-3 px-3 py-2.5 cursor-pointer',
                            checked && 'bg-brand-cyan-soft/40',
                          )}
                        >
                          <Checkbox
                            id={`grouped-${c.id}`}
                            checked={checked}
                            onCheckedChange={() => toggleGrouped(c.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                              <span className="font-mono">N° {c.orderNumber}</span>
                              <span className="text-muted-foreground font-normal">
                                {formatDateOnly(c.orderDate)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.patientName || 'Sin paciente'} ·{' '}
                              {c.serviceTypesCount}{' '}
                              {c.serviceTypesCount === 1
                                ? 'servicio'
                                : 'servicios'}
                              {c.serviceKey ? ` · Clave ${c.serviceKey}` : ''}
                            </div>
                          </div>
                          <div className="text-sm font-mono shrink-0">
                            {formatMoney(Number(c.priceAmount) || 0)} $
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {groupedSelection.length === 0 ? (
                    'La factura sale sólo con esta orden.'
                  ) : (
                    <>
                      La factura agrupa{' '}
                      <span className="font-semibold text-foreground">
                        {groupedSelection.length + 1} órdenes
                      </span>{' '}
                      por un total de{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {formatMoney(groupedTotalUsd)} $
                      </span>
                      {invoiceRateBs > 0
                        ? ` (${formatMoney(groupedTotalUsd * invoiceRateBs)} Bs)`
                        : ''}
                      .
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        ) : null}

        {invoiceLocked && alreadyGrouped.length > 0 ? (
          <div className="mt-4 rounded-lg border bg-card p-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-cyan-strong" />
              Factura agrupada · {alreadyGrouped.length + 1} órdenes
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Además de esta orden, la factura N° {invoiceActive?.invoiceNumber}{' '}
              cubre:{' '}
              <span className="font-mono text-foreground">
                {alreadyGrouped.map((o) => `N° ${o.orderNumber}`).join(', ')}
              </span>
              . Al anularla, todas vuelven a quedar sin factura.
            </p>
          </div>
        ) : null}

        {canIssueInvoice ? (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-warning">
              {neverInvoiced
                ? 'La orden se finalizó sin factura. Puedes emitirla ahora con el número y la fecha de arriba.'
                : 'La factura anterior quedó anulada. La orden sigue finalizada: emite una factura nueva con otro número.'}
            </p>
            {canBilling ? (
              <Button
                type="button"
                onClick={handleIssueInvoice}
                disabled={issuing || !invoiceNumberOk || !invoiceDate}
              >
                <ReceiptText className="w-4 h-4" />
                {issuing ? 'Emitiendo…' : 'Emitir factura'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="Facturas emitidas"
        description="Historial fiscal de la orden. Anular una factura NO cancela la orden: queda el rastro y puedes emitir otra con un número nuevo."
      >
        {(order.invoices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            La orden todavía no tiene facturas emitidas.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card overflow-hidden">
            {(order.invoices ?? []).map((inv) => {
              const cancelled = inv.status === 'cancelled';
              return (
                <li
                  key={inv.id}
                  className="px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <span className="font-mono">N° {inv.invoiceNumber}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          cancelled
                            ? 'text-destructive border-destructive/40'
                            : 'text-success border-success/40',
                        )}
                      >
                        {cancelled ? 'Anulada' : 'Vigente'}
                      </Badge>
                      {(inv.coveredOrders ?? []).length > 1 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-brand-cyan-strong border-brand-cyan-strong/40"
                        >
                          Agrupada · {(inv.coveredOrders ?? []).length} órdenes
                        </Badge>
                      ) : null}
                    </div>
                    {(inv.coveredOrders ?? []).length > 1 ? (
                      <div className="text-xs text-muted-foreground">
                        Órdenes:{' '}
                        <span className="font-mono">
                          {(inv.coveredOrders ?? [])
                            .map((o) => o.orderNumber)
                            .join(', ')}
                        </span>
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Control{' '}
                      <span className="font-mono">{inv.controlNumber}</span> ·
                      Emitida el {formatDateOnly(inv.invoiceDate)}
                      {inv.createdBy
                        ? ` · por ${orderUserDisplayName(inv.createdBy)}`
                        : ''}
                    </div>
                    {cancelled ? (
                      <div className="text-xs text-destructive">
                        Anulada
                        {inv.cancelledBy
                          ? ` por ${orderUserDisplayName(inv.cancelledBy)}`
                          : ''}
                        {inv.cancelReason ? ` — ${inv.cancelReason}` : ''}
                      </div>
                    ) : null}
                  </div>
                  {!cancelled && canBilling ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoiceToCancel(inv)}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Anular factura
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      {canSetProviderAmount ? (
      <FormSection
        title="Liquidación por proveedor"
        description="Asigna el monto USD a pagar a cada proveedor. Cada uno se factura por separado."
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
              const amountInvalid =
                amountErrorsVisible &&
                (p.amount === undefined || p.amount <= 0);
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
                        Orden N°{' '}
                        <span className="font-mono font-semibold text-foreground">
                          {providerInternalNumber(order, p.providerType, p.providerId)}
                        </span>{' '}
                        · {p.serviceTypeNames.join(', ')}
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
                        invalid={amountInvalid}
                      />
                      {amountInvalid && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Ingresa un monto mayor que cero
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Sugerido: {formatMoney(p.suggested)} USD
                      </p>
                    </div>
                  </div>

                  <Accordion
                    type="single"
                    collapsible
                    className="rounded-lg border bg-muted/20 px-3"
                  >
                    <AccordionItem value="breakdown" className="border-b-0">
                      <AccordionTrigger className="text-xs">
                        <span className="flex items-center gap-2">
                          <ListTree className="w-3.5 h-3.5 text-muted-foreground" />
                          Desglose por servicio
                          <span className="text-[11px] font-normal text-muted-foreground">
                            · {p.breakdown.length} servicio
                            {p.breakdown.length === 1 ? '' : 's'}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="divide-y rounded-md border bg-card overflow-hidden">
                          {p.breakdown.map((l) => (
                            <li
                              key={l.stName}
                              className="flex items-center justify-between px-3 py-2 text-xs gap-2"
                            >
                              <span className="truncate">
                                {l.stName}
                                {l.qty > 1 && (
                                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                                    x{l.qty}
                                    {l.unit !== null && (
                                      <> · {formatMoney(l.unit)} USD c/u</>
                                    )}
                                  </span>
                                )}
                              </span>
                              {l.amount !== null ? (
                                <span className="font-mono shrink-0">
                                  {formatMoney(l.amount)} USD
                                </span>
                              ) : (
                                <span className="text-warning italic shrink-0">
                                  Sin precio
                                </span>
                              )}
                            </li>
                          ))}
                          <li className="flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 gap-2">
                            <span>Sugerido</span>
                            <span className="font-mono shrink-0">
                              {formatMoney(p.suggested)} USD
                            </span>
                          </li>
                        </ul>
                        {missing.length > 0 && (
                          <p className="mt-2 text-[11px] text-warning">
                            El proveedor no tiene precio definido para{' '}
                            <strong>{missing.join(', ')}</strong>. Ingresa el monto
                            manualmente.
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                </div>
              );
            })}

            {!invoiceRateId && (
              <p className="text-xs italic text-muted-foreground">
                Selecciona la tasa de cambio de la factura antes de finalizar. Si
                no hay tasas cargadas, agrégalas en Tasas de cambio.
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
                disabled={
                  saving ||
                  isFinalized ||
                  !invoiceRateId ||
                  exceedsCap ||
                  (invoiceEnabled && (!invoiceNumberOk || !invoiceDate))
                }
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
            No tienes permiso para asignar la liquidación a los proveedores
            {isFinalized ? '' : ' ni finalizar la orden'}.
          </p>
        </FormSection>
      )}

      {isFinalized ? (
        <FormSection
          title="Próximos pasos"
          description="Registra pagos y cobros desde sus respectivas secciones."
        >
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => {
              const params = new URLSearchParams();
              params.set('tab', 'pending');
              params.set(
                'search',
                providerInternalNumber(order, p.providerType, p.providerId),
              );
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
                to={`/accounts-receivable?tab=pending&search=${encodeURIComponent(order.orderNumber)}`}
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
          Finaliza la orden para registrar los pagos a los proveedores
          {order.type === 'insurance' ? ' y el cobro al seguro' : ''}
          {order.type === 'credit' ? ' y el cobro del crédito al titular' : ''}
          {order.type === 'cashea' ? ' y el cobro vía Cashea' : ''}.
        </p>
      )}

      <OrderInvoiceCancelModal
        key={invoiceToCancel?.id ?? 'sin-factura'}
        open={!!invoiceToCancel}
        onOpenChange={(open) => {
          if (!open) setInvoiceToCancel(null);
        }}
        orderId={order.id}
        invoice={invoiceToCancel}
        onDone={() => {
          setInvoiceToCancel(null);
          // La anulada quemó su número: propone el próximo libre para reemitir.
          orderGateway
            .invoiceNumberAvailability({})
            .then((res) => setInvoiceNumber(res.suggestion))
            .catch(() => undefined);
          onSaved();
        }}
      />
    </div>
  );
}
