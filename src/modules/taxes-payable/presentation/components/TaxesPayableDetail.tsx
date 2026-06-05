import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DetailBadge,
  DetailDialog,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { taxesPayableGateway } from '../../infrastructure/taxesPayableGateway';
import {
  paidBs,
  pendingBs,
  PERSON_TYPE_LABEL,
  recipientName,
  STATUS_LABEL,
  taxAmountBs,
  type TaxPayable,
  type TaxPayableStatus,
} from '../../domain/models/taxesPayable';
import { PaymentHistoryList } from '@/modules/accounts-payable/presentation/components/PaymentHistoryList';
import {
  downloadInvoiceXlsx,
  downloadWithholdingXlsx,
} from './taxesPayableExcel';
import {
  downloadInvoicePdf,
  downloadWithholdingPdf,
} from './taxesPayablePdf';

export type TaxesPayableDetailProps = {
  taxPayableId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fmtBs(n: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function TaxesPayableDetail({
  taxPayableId,
  open,
  onOpenChange,
}: TaxesPayableDetailProps) {
  const [tax, setTax] = useState<TaxPayable | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<null | 'inv-xlsx' | 'inv-pdf' | 'wh-xlsx' | 'wh-pdf'>(
    null,
  );

  useEffect(() => {
    if (!open || !taxPayableId) {
      setTax(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    taxesPayableGateway
      .getById(taxPayableId)
      .then((t) => {
        if (!cancelled) setTax(t);
      })
      .catch((e) => {
        if (!cancelled) notify.fromError(e, 'No se pudo cargar la cuenta.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxPayableId, open]);

  const tBs = tax ? taxAmountBs(tax) : 0;
  const pd = tax ? paidBs(tax) : 0;
  const pBs = tax ? pendingBs(tax) : 0;
  const ratePct = tax?.taxRate ? (Number(tax.taxRate) * 100).toFixed(0) : null;
  const statusTone = (s: TaxPayableStatus) =>
    s === 'paid' ? 'success' : s === 'partially_paid' ? 'info' : 'warning';

  const gross = tax ? Number(tax.grossAmountBs) || 0 : 0;
  const sub = tax ? Number(tax.subtrahendBs) || 0 : 0;
  const utBs = tax ? Number(tax.taxUnitAmountBs) || 0 : 0;
  const netBs = Math.max(0, gross - tBs);

  const handleDownload = async (
    kind: 'inv-xlsx' | 'inv-pdf' | 'wh-xlsx' | 'wh-pdf',
  ) => {
    if (!tax) return;
    setDownloading(kind);
    try {
      if (kind === 'inv-xlsx') await downloadInvoiceXlsx(tax);
      else if (kind === 'inv-pdf') await downloadInvoicePdf(tax);
      else if (kind === 'wh-xlsx') await downloadWithholdingXlsx(tax);
      else await downloadWithholdingPdf(tax);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo generar el archivo'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <DetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Receipt}
      title={tax ? `Retención por pagar N° ${tax.taxPayableNumber}` : 'Detalle'}
      loading={loading}
    >
      {tax ? (
        <div className="divide-y">
          <DetailSection title="Información">
            <DetailRow label="N° comprobante" value={tax.taxPayableNumber} mono />
            <DetailRow label="Proveedor" value={recipientName(tax)} />
            <DetailRow
              label="Tipo"
              value={tax.recipientType === 'doctor' ? 'Doctor' : 'Centro de atención'}
            />
            <DetailRow label="Régimen fiscal" value={PERSON_TYPE_LABEL[tax.personType]} />
            <DetailRow label="Tasa aplicada" value={ratePct ? `${ratePct}%` : null} />
            <DetailRow
              label="Estado"
              value={
                <DetailBadge tone={statusTone(tax.status)}>
                  {STATUS_LABEL[tax.status]}
                </DetailBadge>
              }
            />
            <DetailRow
              label="Pagada el"
              value={tax.paidAt ? new Date(tax.paidAt).toLocaleString('es-VE') : null}
            />
          </DetailSection>

          <DetailSection title="Cálculo SENIAT">
            <DetailRow
              label="UT vigente"
              value={
                <>
                  <span className="font-mono">Bs. {fmtBs(utBs)}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    (desde{' '}
                    {new Date(tax.taxUnit.effectiveDate).toLocaleDateString('es-VE')})
                  </span>
                </>
              }
            />
            <DetailRow label="Base imponible (bruto)" value={`${fmtBs(gross)} Bs.`} mono />
            <DetailRow
              label="Sustraendo"
              value={
                tax.personType === 'natural'
                  ? `${fmtBs(sub)} Bs.`
                  : '— (no aplica a PJD)'
              }
              mono
            />
            <DetailRow label="Retención" value={`${fmtBs(tBs)} Bs.`} mono />
            <DetailRow label="Neto al proveedor" value={`${fmtBs(netBs)} Bs.`} mono />
            <div className="text-[11px] italic text-muted-foreground mt-2">
              {tax.personType === 'natural'
                ? 'Fórmula: (Monto × 3%) − (UT × 0,03 × 83,33334). Aplica sólo si bruto > UT × 83,33334.'
                : 'Fórmula: Monto × 5% (sin sustraendo, sin umbral).'}
            </div>
          </DetailSection>

          <DetailSection
            title={`Órdenes contenidas (${(tax.orders ?? []).length})`}
          >
            {(tax.orders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin órdenes vinculadas.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(tax.orders ?? []).map((o) => (
                  <Link
                    key={o.id}
                    to={`/orders/edit/${o.id}`}
                    className="font-mono text-xs px-2 py-0.5 rounded border bg-muted/40 hover:bg-muted"
                  >
                    N° {o.orderNumber}
                  </Link>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection
            title={`Cuentas por pagar cubiertas (${(tax.accountsPayables ?? []).length})`}
          >
            {(tax.accountsPayables ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cuentas vinculadas.</p>
            ) : (
              <ul className="text-sm divide-y">
                {(tax.accountsPayables ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <span className="font-mono">{a.payableNumber}</span>
                    <span className="font-mono text-muted-foreground">
                      {a.providerAmount
                        ? `${Number(a.providerAmount).toFixed(2)} USD`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Documentos">
            <div className="space-y-2">
              <div className="rounded-lg border bg-card p-3 flex items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-md bg-success-soft text-success flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-semibold">Factura agrupada</div>
                  <div className="text-xs text-muted-foreground">
                    Resumen del pago al proveedor con todas las órdenes.
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('inv-xlsx')}
                    disabled={downloading !== null}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === 'inv-xlsx' ? 'Generando…' : 'Excel'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('inv-pdf')}
                    disabled={downloading !== null}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === 'inv-pdf' ? 'Generando…' : 'PDF'}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 flex items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-md bg-warning-soft text-warning flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-semibold">Comprobante de retención</div>
                  <div className="text-xs text-muted-foreground">
                    Detalle SENIAT del cálculo (UT, tasa, sustraendo, retención).
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('wh-xlsx')}
                    disabled={downloading !== null}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === 'wh-xlsx' ? 'Generando…' : 'Excel'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('wh-pdf')}
                    disabled={downloading !== null}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === 'wh-pdf' ? 'Generando…' : 'PDF'}
                  </Button>
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Saldo al SENIAT">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total a pagar
                </div>
                <div className="text-lg font-semibold font-mono">{fmtBs(tBs)} Bs.</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Total pagado
                </div>
                <div className="text-lg font-semibold font-mono">{fmtBs(pd)} Bs.</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Diferencia
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  {pBs <= 0.01 ? (
                    <Badge variant="default" className="bg-success text-white">
                      Cuadrado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-warning text-white">
                      Faltan {fmtBs(pBs)} Bs.
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection title={`Pagos al SENIAT registrados (${tax.payments?.length ?? 0})`}>
            <PaymentHistoryList payments={tax.payments} />
          </DetailSection>

          {(tax.createdAt || tax.updatedAt) && (
            <DetailSection title="Auditoría">
              {tax.createdAt && (
                <DetailRow
                  label="Creada"
                  value={new Date(tax.createdAt).toLocaleString('es-VE')}
                />
              )}
              {tax.updatedAt && (
                <DetailRow
                  label="Actualizada"
                  value={new Date(tax.updatedAt).toLocaleString('es-VE')}
                />
              )}
            </DetailSection>
          )}
        </div>
      ) : null}
    </DetailDialog>
  );
}
