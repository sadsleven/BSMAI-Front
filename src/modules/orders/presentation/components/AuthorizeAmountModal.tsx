import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications/toast';
import { orderGateway } from '../../infrastructure/orderGateway';
import type { Order } from '../../domain/models/order';

export type AuthorizeAmountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Monto actual de la orden, prefillado en el input. */
  currentAmount: number;
  /** Orden actualizada tras autorizar — el padre sincroniza monto + auditoría. */
  onAuthorized: (order: Order) => void;
};

type Errors = {
  email?: string;
  password?: string;
  amount?: string;
  observation?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthorizeAmountModal({
  open,
  onOpenChange,
  orderId,
  currentAmount,
  onAuthorized,
}: AuthorizeAmountModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState<number | undefined>(currentAmount);
  const [observation, setObservation] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset al abrir: prefilla el monto actual y limpia credenciales.
  useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setAmount(currentAmount);
      setObservation('');
      setErrors({});
    }
  }, [open, currentAmount]);

  const validate = (): boolean => {
    const next: Errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Email del validador inválido';
    if (!password) next.password = 'Contraseña del validador requerida';
    if (amount === undefined || amount <= 0) next.amount = 'El monto debe ser mayor a 0';
    if (observation.trim().length < 3)
      next.observation = 'La observación debe tener al menos 3 caracteres';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const updated = await orderGateway.authorizeAmount(orderId, {
        validatorEmail: email.trim().toLowerCase(),
        validatorPassword: password,
        priceAmount: amount as number,
        observation: observation.trim(),
      });
      notify.success('Monto autorizado por el validador');
      onAuthorized(updated);
      onOpenChange(false);
    } catch (err) {
      notify.fromError(err, 'No se pudo autorizar el monto.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-[520px] rounded-xl p-0 overflow-hidden flex flex-col gap-0">
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
            <div className="w-10 h-10 rounded-full bg-warning-soft text-warning flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                Solicitar autorización de monto
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Un usuario con permiso para editar el monto debe validar sus
                credenciales e ingresar el nuevo monto y una observación. Quedará
                registrado como autor del cambio.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="validatorEmail" className="text-sm font-medium">
              Email del validador
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="validatorEmail"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="validador@correo.com"
              className={cn('h-9', errors.email && 'border-destructive')}
            />
            <FieldError message={errors.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="validatorPassword" className="text-sm font-medium">
              Contraseña del validador
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <PasswordInput
              id="validatorPassword"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn('h-9', errors.password && 'border-destructive')}
            />
            <FieldError message={errors.password} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Nuevo monto
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <CurrencyAmountInput
              value={amount}
              onChange={setAmount}
              currencyPrefix="USD"
              invalid={!!errors.amount}
            />
            <FieldError message={errors.amount} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observation" className="text-sm font-medium">
              Observación
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Textarea
              id="observation"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Motivo del ajuste de monto (descuento, monto especial, etc.)"
              className={cn(errors.observation && 'border-destructive')}
            />
            <FieldError message={errors.observation} />
          </div>
        </div>

        <AlertDialogFooter className="px-6 py-4 border-t gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Autorizando…' : 'Autorizar monto'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertTriangle className="w-3 h-3" />
      {message}
    </p>
  );
}
