import { api } from '@/lib/api';
import type { Bank } from '../domain/models/bank';

export const bankGateway = {
  async list(): Promise<Bank[]> {
    const { data } = await api.get<Bank[]>('/banks');
    return data;
  },
};
