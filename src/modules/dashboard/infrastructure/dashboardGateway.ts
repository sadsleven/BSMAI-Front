import { api } from '@/lib/api';

export interface CountResponse {
  count: number;
}

export interface AmountUsdResponse {
  amount: number;
  currency: 'USD';
}

export interface AmountBsResponse {
  amount: number;
  currency: 'BS';
}

export const dashboardGateway = {
  async patientsActiveCount(): Promise<CountResponse> {
    const { data } = await api.get<CountResponse>('/dashboard/patients-active-count');
    return data;
  },
  async ordersTodayCount(): Promise<CountResponse> {
    const { data } = await api.get<CountResponse>('/dashboard/orders-today-count');
    return data;
  },
  async ordersPendingCount(): Promise<CountResponse> {
    const { data } = await api.get<CountResponse>('/dashboard/orders-pending-count');
    return data;
  },
  async billedMonthUsd(): Promise<AmountUsdResponse> {
    const { data } = await api.get<AmountUsdResponse>('/dashboard/billed-month-usd');
    return data;
  },
  async collectedMonthUsd(): Promise<AmountUsdResponse> {
    const { data } = await api.get<AmountUsdResponse>('/dashboard/collected-month-usd');
    return data;
  },
  async receivableTotalUsd(): Promise<AmountUsdResponse> {
    const { data } = await api.get<AmountUsdResponse>('/dashboard/receivable-total-usd');
    return data;
  },
  async payableTotalUsd(): Promise<AmountUsdResponse> {
    const { data } = await api.get<AmountUsdResponse>('/dashboard/payable-total-usd');
    return data;
  },
  async taxesPayableTotalBs(): Promise<AmountBsResponse> {
    const { data } = await api.get<AmountBsResponse>('/dashboard/taxes-payable-total-bs');
    return data;
  },
};
