import { api } from './client';

export interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string | null;
  badge?: string | null;
}

export interface SearchResults {
  patients: SearchResultItem[];
  orders: SearchResultItem[];
  doctors: SearchResultItem[];
  careCenters: SearchResultItem[];
}

export const searchGateway = {
  async search(q: string, signal?: AbortSignal): Promise<SearchResults> {
    const { data } = await api.get<SearchResults>('/search', {
      params: { q },
      signal,
    });
    return data;
  },
};
