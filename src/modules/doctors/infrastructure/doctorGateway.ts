import { api } from '@/lib/api';
import type { ChangePasswordDto } from '@/modules/users/domain/models/user';
import type {
  CreateDoctorDto,
  Doctor,
  DoctorsQuery,
  PaginatedResponse,
  UpdateDoctorDto,
} from '../domain/models/doctor';

function buildParams(q: DoctorsQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    withDeleted: q.withDeleted,
    onlyDeleted: q.onlyDeleted,
    isActive: q.isActive,
    entityType: q.entityType,
    specialtyId: q.specialtyId,
  };
}

export const doctorGateway = {
  async list(query: DoctorsQuery): Promise<PaginatedResponse<Doctor>> {
    const { data } = await api.get<PaginatedResponse<Doctor>>('/doctors', {
      params: buildParams(query),
    });
    return data;
  },
  async listAssignable(): Promise<Doctor[]> {
    const { data } = await api.get<Doctor[]>('/doctors/assignable');
    return data;
  },
  async getById(id: string): Promise<Doctor> {
    const { data } = await api.get<Doctor>(`/doctors/${id}`);
    return data;
  },
  async create(dto: CreateDoctorDto): Promise<Doctor> {
    const { data } = await api.post<Doctor>('/doctors', dto);
    return data;
  },
  async update(id: string, dto: UpdateDoctorDto): Promise<Doctor> {
    const { data } = await api.patch<Doctor>(`/doctors/${id}`, dto);
    return data;
  },
  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    await api.patch(`/doctors/${id}/change-password`, dto);
  },
  async toggleActive(id: string): Promise<Doctor> {
    const { data } = await api.patch<Doctor>(`/doctors/${id}/toggle-active`);
    return data;
  },
  async softDelete(id: string): Promise<void> {
    await api.delete(`/doctors/${id}`);
  },
  async hardDelete(id: string): Promise<void> {
    await api.delete(`/doctors/${id}/permanent`);
  },
  async restore(id: string): Promise<Doctor> {
    const { data } = await api.patch<Doctor>(`/doctors/${id}/restore`);
    return data;
  },
};
