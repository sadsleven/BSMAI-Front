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
import { AlertTriangle, Ban, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { orderGateway } from '../../infrastructure/orderGateway';
import {
  ORDER_STATUS_LABEL,
  isOrderCancelled,
  type Order,
} from '../../domain/models/order';

/**
 * El padre remonta este modal por `key` (id de la orden objetivo) para que el
 * motivo tipeado no sobreviva de una orden a otra.
 */
export type OrderCancelModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Orden objetivo. Si está cancelada, el modal revierte la cancelación. */
  order: Order | null;
  /** Orden actualizada tras cancelar o reactivar (el padre refresca el listado). */
  onDone: (order: Order) => void;
};

/**
 * Cancelar / reactivar una orden. Cancelar NO borra: la orden conserva su
 * número (no deja huecos en la numeración) y queda fuera del flujo. El motivo
 * es obligatorio. Si la orden ya está cancelada, el mismo modal la reactiva y
 * la devuelve al estado que tenía antes.
 */
export function OrderCancelModal({
  open,
  onOpenChange,
  order,
  onDone,
}: OrderCancelModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (!order) return null;

  const cancelled = isOrderCancelled(order);
  const restoredStatus = order.statusBeforeCancel ?? 'draft';

  const onSubmit = async () => {
    if (!cancelled && reason.trim().length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      const updated = cancelled
        ? await orderGateway.uncancel(order.id)
        : await orderGateway.cancel(order.id, reason.trim());
      notify.success(cancelled ? 'Cancelación revertida' : 'Orden cancelada');
      onDone(updated);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(
        err,
        cancelled ? 'No se pudo reactivar la orden.' : 'No se pudo cancelar la orden.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = cancelled ? RotateCcw : Ban;

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
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                cancelled
                  ? 'bg-success-soft text-success'
                  : 'bg-destructive-soft text-destructive',
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                {cancelled
                  ? `¿Reactivar la orden N° ${order.orderNumber}?`
                  : `¿Cancelar la orden N° ${order.orderNumber}?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {cancelled
                  ? `La orden volverá al estado "${ORDER_STATUS_LABEL[restoredStatus]}" y podrás continuar su flujo.`
                  : 'La orden conserva su número y su contenido, pero queda fuera del flujo: no se podrá editar, atender, informar ni facturar hasta que la reactives. Puedes revertir esta acción.'}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="px-6 py-4 space-y-4">
          {cancelled ? (
            order.cancelReason ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Motivo de la cancelación
                </p>
                <p className="text-sm">{order.cancelReason}</p>
              </div>
            ) : null
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason" className="text-sm font-medium">
                Motivo de la cancelación
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Textarea
                id="cancelReason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(undefined);
                }}
                maxLength={500}
                rows={3}
                placeholder="Ej.: el paciente no asistió y no reprogramó la cita."
                className={cn(error && 'border-destructive')}
              />
              {error ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <AlertDialogFooter className="px-6 py-4 border-t gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant={cancelled ? 'default' : 'destructive'}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? cancelled
                ? 'Reactivando…'
                : 'Cancelando…'
              : cancelled
                ? 'Reactivar orden'
                : 'Cancelar orden'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
