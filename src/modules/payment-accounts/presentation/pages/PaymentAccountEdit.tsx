import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { paymentAccountSchema, type PaymentAccountValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { paymentAccountGateway } from '../../infrastructure/paymentAccountGateway';
import type { UpdatePaymentAccountDto } from '../../domain/models/paymentAccount';
import { PaymentAccountFormFields } from '../components/PaymentAccountFormFields';

function toUpdateDto(v: PaymentAccountValues): UpdatePaymentAccountDto {
  const out: UpdatePaymentAccountDto = {
    name: v.name.trim(),
    isActive: v.isActive,
  };
  if (v.type === 'mobile_payment') {
    out.bankCode = v.bankCode?.trim();
    out.phoneNumber = v.phoneNumber?.trim();
    out.idDocument = v.idDocument?.trim();
    out.accountHolderName = v.accountHolderName?.trim();
  } else if (v.type === 'bank_transfer' || v.type === 'bank_transfer_usd') {
    out.bankCode = v.bankCode?.trim();
    out.accountNumber = v.accountNumber?.trim();
    out.accountHolderName = v.accountHolderName?.trim();
    out.idDocument = v.idDocument?.trim();
  } else if (v.type === 'card') {
    out.bankCode = v.bankCode?.trim();
    out.accountHolderName = v.accountHolderName?.trim();
  } else {
    out.description = v.description?.trim();
  }
  return out;
}

export function PaymentAccountEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');

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

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const a = await paymentAccountGateway.getById(id);
        form.reset({
          name: a.name,
          type: a.type,
          isActive: a.isActive,
          bankCode: a.bankCode ?? '',
          phoneNumber: a.phoneNumber ?? '',
          idDocument: a.idDocument ?? '',
          accountHolderName: a.accountHolderName ?? '',
          accountNumber: a.accountNumber ?? '',
          description: a.description ?? '',
        });
        setDisplayName(a.name);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar la cuenta bancaria.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: PaymentAccountValues) => {
    if (!id) return;
    try {
      await paymentAccountGateway.update(id, toUpdateDto(values));
      notify.success('Cuenta bancaria actualizada');
      navigate('/payment-accounts');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar la cuenta bancaria.');
    }
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando cuenta…</div>;
  }

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
                Editar cuenta bancaria
              </h1>
              {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/payment-accounts')}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a cuentas bancarias
            </button>
          </div>

          <PaymentAccountFormFields lockType />

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
                {form.formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
