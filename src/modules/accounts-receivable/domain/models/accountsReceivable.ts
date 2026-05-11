import type {
  Order,
  OrderPaymentType,
  PaymentCurrency,
} from '@/modules/orders/domain/models/order';

export type AccountsReceivableStatus =
  | 'collected'
  | 'uncollected'
  | 'partially_collected'
  | 'overcollected';

export interface AccountsReceivablePayment {
  id: string;
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  exchangeRateId?: string | null;
  amountCurrency: PaymentCurrency;
  amountValue: string | number;
  amountInBs: string | number;
  createdAt?: string;
}

export interface AccountsReceivable {
  id: string;
  receivableNumber: string;
  orderId: string;
  order: Order;
  insuranceId: string;
  insurance: { id: string; name: string };
  status: AccountsReceivableStatus;
  collectedAt?: string | null;
  payments?: AccountsReceivablePayment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountsReceivableQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountsReceivableStatus;
  insuranceId?: string;
  branchId?: string;
  orderId?: string;
  sortBy?: 'orderNumber' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface RegisterCollectionInput {
  type: OrderPaymentType;
  paymentDate: string;
  referenceNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  exchangeRateId?: string;
  amountCurrency: PaymentCurrency;
  amountValue: number;
}

export interface RegisterCollectionDto {
  receivableIds: string[];
  payments: RegisterCollectionInput[];
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}

export const STATUS_LABEL: Record<AccountsReceivableStatus, string> = {
  collected: 'Cobrada',
  uncollected: 'No cobrada',
  partially_collected: 'Cobrada parcialmente',
  overcollected: 'Sobre-cobrada',
};
