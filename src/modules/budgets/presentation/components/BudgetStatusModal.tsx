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
import { CheckCircle2, Send, Undo2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { budgetGateway } from '../../infrastructure/budgetGateway';
import {
  BUDGET_STATUS_LABEL,
  type Budget,
  type BudgetStatus,
} from '../../domain/models/budget';

const COPY: Record<
  BudgetStatus,
  { title: string; description: string; icon: typeof Send; tone: string }
> = {
  sent: {
    title: 'Marcar como enviado',
    description:
      'El presupuesto queda registrado como entregado al paciente o al seguro. Se puede seguir editando hasta que se apruebe.',
    icon: Send,
    tone: 'bg-brand-blue-soft text-brand-blue-strong',
  },
  approved: {
    title: 'Marcar como aprobado',
    description:
      'El paciente o el seguro aceptó el presupuesto. Desde el detalle podrás crear la orden con estos mismos datos.',
    icon: CheckCircle2,
    tone: 'bg-success-soft text-success',
  },
  rejected: {
    title: 'Marcar como rechazado',
    description:
      'El presupuesto no fue aceptado. Queda guardado con su motivo para consultarlo después.',
    icon: XCircle,
    tone: 'bg-destructive-soft text-destructive',
  },
  draft: {
    title: 'Devolver a borrador',
    description:
      'El presupuesto vuelve a borrador para corregirlo antes de reenviarlo.',
    icon: Undo2,
    tone: 'bg-muted text-muted-foreground',
  },
};

/**
 * Cambia el estado del presupuesto. El padre lo remonta por `key` (id +
 * estado destino) para que el motivo tipeado no sobreviva de un uso a otro.
 */
export function BudgetStatusModal({
  open,
  onOpenChange,
  budget,
  target,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget | null;
  /** Estado al que se quiere mover. */
  target: BudgetStatus;
  onDone: (budget: Budget) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (!budget) return null;

  const copy = COPY[target];
  const Icon = copy.icon;
  const needsReason = target === 'rejected';

  const onSubmit = async () => {
    if (needsReason && reason.trim().length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await budgetGateway.changeStatus(budget.id, {
        status: target,
        rejectReason: needsReason ? reason.trim() : undefined,
      });
      notify.success(
        `Presupuesto ${budget.budgetNumber}: ${BUDGET_STATUS_LABEL[target].toLowerCase()}`,
      );
      onDone(updated);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo cambiar el estado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex flex-col gap-0 overflow-hidden rounded-xl p-0 data-[size=default]:sm:max-w-[480px]">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <AlertDialogHeader className="gap-3 px-6 pr-12 pt-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                copy.tone,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                {copy.title} — {budget.budgetNumber}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {copy.description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {needsReason ? (
          <div className="space-y-1.5 px-6 py-4">
            <Label htmlFor="budgetRejectReason" className="text-sm font-medium">
              Motivo del rechazo
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              id="budgetRejectReason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(undefined);
              }}
              maxLength={500}
              rows={3}
              placeholder="Ej. el seguro no cubre el procedimiento"
              className={cn(error && 'border-destructive')}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : (
          <div className="px-6 py-2" />
        )}

        <AlertDialogFooter className="gap-2 border-t bg-muted/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitting}
            variant={target === 'rejected' ? 'destructive' : 'default'}
          >
            {submitting ? 'Guardando…' : copy.title}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
