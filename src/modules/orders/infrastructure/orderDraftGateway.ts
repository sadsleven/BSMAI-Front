import { api } from '@/lib/api';
import type { OrderDraft, SaveOrderDraftDto } from '../domain/models/orderDraft';

export const orderDraftGateway = {
  async list(): Promise<OrderDraft[]> {
    const { data } = await api.get<OrderDraft[]>('/order-drafts');
    return data;
  },
  async getById(id: string): Promise<OrderDraft> {
    const { data } = await api.get<OrderDraft>(`/order-drafts/${id}`);
    return data;
  },
  async create(dto: SaveOrderDraftDto): Promise<OrderDraft> {
    const { data } = await api.post<OrderDraft>('/order-drafts', dto);
    return data;
  },
  async update(id: string, dto: SaveOrderDraftDto): Promise<OrderDraft> {
    const { data } = await api.patch<OrderDraft>(`/order-drafts/${id}`, dto);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/order-drafts/${id}`);
  },
};
