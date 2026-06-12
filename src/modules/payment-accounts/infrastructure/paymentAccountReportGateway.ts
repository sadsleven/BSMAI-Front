import { api } from '@/lib/api';
import type { PaymentAccountType } from '../domain/models/paymentAccount';

export interface InflowRow {
  id: string;
  source: 'order' | 'receivable';
  paymentDate: string;
  type: PaymentAccountType | 'cash_usd' | 'cash_eur' | 'cash_bs';
  referenceNumber: string | null;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  paymentAccountType: PaymentAccountType | null;
  bankCode: string | null;
  amountValue: number;
  amountCurrency: 'USD' | 'EUR' | 'BS';
  amountInUsd: number;
  documentNumber: string;
  counterpart: string;
}

export interface InflowByAccount {
  paymentAccountId: string;
  paymentAccountName: string;
  paymentAccountType: PaymentAccountType;
  bankCode: string | null;
  isActive: boolean;
  deletedAt: string | null;
  ordersCount: number;
  ordersUsd: number;
  receivablesCount: number;
  receivablesUsd: number;
  totalCount: number;
  totalUsd: number;
}

export interface InflowsReport {
  totals: {
    totalCount: number;
    totalUsd: number;
    ordersCount: number;
    ordersUsd: number;
    receivablesCount: number;
    receivablesUsd: number;
  };
  byAccount: InflowByAccount[];
  rows: InflowRow[];
  truncated: boolean;
}

export interface InflowsQuery {
  from?: string;
  to?: string;
  source?: 'orders' | 'receivables' | 'all';
  paymentAccountId?: string;
  type?: PaymentAccountType;
}

export const paymentAccountReportGateway = {
  async inflows(query: InflowsQuery = {}): Promise<InflowsReport> {
    const { data } = await api.get<InflowsReport>('/payment-accounts/reports/inflows', {
      params: {
        from: query.from,
        to: query.to,
        source: query.source,
        paymentAccountId: query.paymentAccountId,
        type: query.type,
      },
    });
    return data;
  },
};
