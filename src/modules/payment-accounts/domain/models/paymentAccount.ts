export type PaymentAccountType = 'mobile_payment' | 'bank_transfer' | 'other';

export const PAYMENT_ACCOUNT_TYPE_LABEL: Record<PaymentAccountType, string> = {
  mobile_payment: 'Pago móvil',
  bank_transfer: 'Transferencia',
  other: 'Otro',
};

export interface PaymentAccount {
  id: string;
  name: string;
  type: PaymentAccountType;
  isActive: boolean;
  bankCode?: string | null;
  phoneNumber?: string | null;
  idDocument?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreatePaymentAccountDto {
  name: string;
  type: PaymentAccountType;
  isActive?: boolean;
  bankCode?: string;
  phoneNumber?: string;
  idDocument?: string;
  accountHolderName?: string;
  accountNumber?: string;
  description?: string;
}

export type UpdatePaymentAccountDto = Partial<CreatePaymentAccountDto>;

export interface PaymentAccountsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: PaymentAccountType;
  sortBy?: 'name' | 'type' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

/** Resumen corto de la cuenta para mostrar en selects/listas. */
export function paymentAccountSummary(a: PaymentAccount): string {
  if (a.type === 'mobile_payment') {
    return [a.bankCode, a.idDocument, a.phoneNumber].filter(Boolean).join(' · ');
  }
  if (a.type === 'bank_transfer') {
    const acc = a.accountNumber ? `Cta ${a.accountNumber}` : null;
    return [a.bankCode, acc, a.accountHolderName].filter(Boolean).join(' · ');
  }
  return a.description ?? '';
}
