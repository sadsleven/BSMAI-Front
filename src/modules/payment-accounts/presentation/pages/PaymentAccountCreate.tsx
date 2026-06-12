import { useNavigate } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { paymentAccountSchema, type PaymentAccountValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { paymentAccountGateway } from '../../infrastructure/paymentAccountGateway';
import type { CreatePaymentAccountDto } from '../../domain/models/paymentAccount';
import { PaymentAccountFormFields } from '../components/PaymentAccountFormFields';

function toCreateDto(v: PaymentAccountValues): CreatePaymentAccountDto {
  const out: CreatePaymentAccountDto = {
    name: v.name.trim(),
    type: v.type,
    isActive: v.isActive ?? true,
  };
  if (v.type === 'mobile_payment') {
    out.bankCode = v.bankCode?.trim();
    out.phoneNumber = v.phoneNumber?.trim();
    out.idDocument = v.idDocument?.trim();
    out.accountHolderName = v.accountHolderName?.trim();
  } else if (v.type === 'bank_transfer') {
    out.bankCode = v.bankCode?.trim();
    out.accountNumber = v.accountNumber?.trim();
    out.accountHolderName = v.accountHolderName?.trim();
    out.idDocument = v.idDocument?.trim();
  } else {
    out.description = v.description?.trim();
  }
  return out;
}

export function PaymentAccountCreate() {
  const navigate = useNavigate();

  const form = useForm<PaymentAccountValues>({
    resolver: zodResolver(paymentAccountSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      type: 'mobile_payment',
      isActive: true,
      bankCode: '',
      phoneNumber: '',
      idDocument: '',
      accountHolderName: '',
      accountNumber: '',
      description: '',
    },
  });

  const onSubmit = async (values: PaymentAccountValues) => {
    try {
      await paymentAccountGateway.create(toCreateDto(values));
      notify.success('Cuenta de pago creada');
      navigate('/payment-accounts');
    } catch (err) {
      notify.fromError(err, 'No se pudo crear la cuenta de pago.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))}
          className="space-y-6"
          noValidate
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
                Nueva cuenta de pago
              </h1>
              <p className="text-sm text-muted-foreground">
                Definí una cuenta propia para recibir pagos y cobros.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/payment-accounts')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a cuentas de pago
            </button>
          </div>

          <PaymentAccountFormFields />

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Campos obligatorios
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/payment-accounts')}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creando…' : 'Crear cuenta'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
