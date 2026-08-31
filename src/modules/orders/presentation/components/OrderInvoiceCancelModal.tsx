import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Ban, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { orderGateway } from '../../infrastructure/orderGateway';
import type { Order, OrderInvoice } from '../../domain/models/order';

export type OrderInvoiceCancelModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Factura vigente a anular. El padre remonta el modal por su id. */
  invoice: OrderInvoice | null;
  /** Orden actualizada tras anular (el padre refresca el Paso 4). */
  onDone: (order: Order) => void;
};

/**
 * Anula una FACTURA de la orden — no la orden. La orden sigue activa y puede
 * emitir otra factura; la anulada queda registrada con su motivo y su número
 * se quema para siempre (nunca se reutiliza).
 */
export function OrderInvoiceCancelModal({
  open,
  onOpenChange,
  orderId,
  invoice,
  onDone,
}: OrderInvoiceCancelModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (!invoice) return null;

  const onSubmit = async () => {
    if (reason.trim().length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await orderGateway.cancelInvoice(
        orderId,
        invoice.id,
        reason.trim(),
      );
      notify.success(`Factura N° ${invoice.invoiceNumber} anulada`);
      onDone(updated);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo anular la factura.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[480px] rounded-xl p-0 overflow-hidden flex flex-col gap-0">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <AlertDialogHeader className="px-6 pt-5 pr-12 gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-destructive-soft text-destructive">
              <Ban className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                ¿Anular la factura N° {invoice.invoiceNumber}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                La orden NO se cancela: sigue activa y podrás emitirle otra
                factura con un número nuevo. La factura anulada queda en el
                historial con su motivo.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            El N° {invoice.invoiceNumber} y su N° de control{' '}
            {invoice.controlNumber} NO se podrán volver a usar: ese número ya se
            emitió.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceCancelReason" className="text-sm font-medium">
              Motivo de la anulación
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Textarea
              id="invoiceCancelReason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(undefined);
              }}
              maxLength={500}
              rows={3}
              placeholder="Ej.: se emitió con datos del contratante equivocados."
              className={cn(error && 'border-destructive')}
            />
            {error ? (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <AlertDialogFooter className="px-6 py-4 border-t gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? 'Anulando…' : 'Anular factura'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
