import { api } from '@/lib/api';
import type {
  CasheaCommissionConfig,
  UpdateCasheaCommissionInput,
} from '../domain/models/appConfig';

export const appConfigGateway = {
  async getCasheaCommission(): Promise<CasheaCommissionConfig> {
    const { data } = await api.get<CasheaCommissionConfig>('/app-config/cashea');
    return data;
  },
  async updateCasheaCommission(
    input: UpdateCasheaCommissionInput,
  ): Promise<CasheaCommissionConfig> {
    const { data } = await api.put<CasheaCommissionConfig>(
      '/app-config/cashea',
      input,
    );
    return data;
  },
};
