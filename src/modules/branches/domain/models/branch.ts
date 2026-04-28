export interface Branch {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateBranchDto {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateBranchDto {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface BranchesQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
