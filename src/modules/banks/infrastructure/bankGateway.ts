import { api } from '@/lib/api';
import type { Bank, CreateBankDto, UpdateBankDto } from '../domain/models/bank';

export const bankGateway = {
  async list(): Promise<Bank[]> {
    const { data } = await api.get<Bank[]>('/banks');
    return data;
  },
  async create(dto: CreateBankDto): Promise<Bank> {
    const { data } = await api.post<Bank>('/banks', dto);
    return data;
  },
  async update(id: string, dto: UpdateBankDto): Promise<Bank> {
    const { data } = await api.patch<Bank>(`/banks/${id}`, dto);
    return data;
  },
  async toggleActive(id: string): Promise<Bank> {
    const { data } = await api.patch<Bank>(`/banks/${id}/toggle-active`);
    return data;
  },
};
