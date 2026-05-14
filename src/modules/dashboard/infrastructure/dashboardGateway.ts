import { api } from '@/lib/api';

export interface CountResponse {
  count: number;
}

export interface BilledMonthUsdResponse {
  amount: number | null;
  currency: 'USD';
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
  async billedMonthUsd(): Promise<BilledMonthUsdResponse> {
    const { data } = await api.get<BilledMonthUsdResponse>('/dashboard/billed-month-usd');
    return data;
  },
};
