export type Currency = 'USD' | 'EUR';
export const CURRENCIES: Currency[] = ['USD', 'EUR'];

export interface ExchangeRate {
  id: string;
  currency: Currency;
  /** Backend devuelve string para preservar decimales (ej. "485.22"). */
  amountBs: string;
  effectiveDate: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateExchangeRateDto {
  currency: Currency;
  amountBs: number;
  effectiveDate: string;
  isActive?: boolean;
}

export interface UpdateExchangeRateDto {
  currency?: Currency;
  amountBs?: number;
  effectiveDate?: string;
  isActive?: boolean;
}

export interface ExchangeRatesQuery {
  page?: number;
  limit?: number;
  sortBy?: 'effectiveDate' | 'amountBs' | 'currency' | 'createdAt' | 'updatedAt';
  sortDir?: 'ASC' | 'DESC';
  currency?: Currency;
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: { total: number; page: number; lastPage: number };
}
