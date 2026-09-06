'use client';
/** Data hooks, one per endpoint. Reference data never changes within a session (staleTime: Infinity). */
import { useQuery, useMutation } from '@tanstack/react-query';
import type { Bbox, LatLng, FileIssue } from '@market-scope/shared';
import { api } from './client';
import { useCurrentPortfolio, useCurrentMarket } from '@/app/providers';

export type City = { id: number; name: string };
export type State = { id: number; name: string; cities: City[] };
export type Country = { id: number; name: string; states: State[] };
export type Category = { id: number; slug: string; name: string };
export type CityBounds = { cityId: number; name: string; bbox: Bbox; centre: LatLng; cached: boolean };
export type Portfolio = { id: number; name: string; sourceFilename: string; rowCount: number; createdAt: string };
export type PortfolioSummary = Portfolio & { withCoords: number; withoutCoords: number; bounds: Bbox | null };
export type UploadResult = PortfolioSummary & { warnings: FileIssue[] };
export type Market = {
  id: number; name: string; portfolioId: number; portfolioName: string; cityId: number; cityName: string;
  boundary: Bbox; areaSqKm: number; placesProvider: 'overpass' | 'google'; geocoderProvider: 'nominatim' | 'google';
  categories: Category[]; createdAt: string;
  status: 'pending' | 'running' | 'ready' | 'partial' | 'failed'; error: string | null;
  startedAt: string | null; completedAt: string | null; storeCount: number;
  progress: { tiles: number; done: number; failed: number } | null;
  geocoding: { total: number; done: number; failed: number };
  placement: { inside: number; outside: number; unlocated: number };
};
export type ProviderOption = { id: 'overpass' | 'nominatim' | 'google'; name: string; enabled: boolean; reason: 'not configured' | 'disabled' | null };
export type Providers = { places: ProviderOption[]; geocoding: ProviderOption[] };
export type CreateMarket = { name?: string; portfolioId: number; cityId: number; categoryIds: number[]; boundary: Bbox; placesProvider: Market['placesProvider']; geocoderProvider: Market['geocoderProvider'] };

export const useLocations = () => useQuery({ queryKey: ['locations'], queryFn: () => api<{ countries: Country[] }>('/locations'), staleTime: Infinity });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories'), staleTime: Infinity });
/** The data sources on offer, with availability: the screen greys out what the server would refuse. */
export const useProviders = () => useQuery({ queryKey: ['providers'], queryFn: () => api<Providers>('/providers'), staleTime: Infinity });
export const useCityBounds = (cityId: number | null) =>
  useQuery({ queryKey: ['city-bbox', cityId], queryFn: () => api<CityBounds>(`/cities/${cityId}/bbox`), enabled: cityId != null, staleTime: Infinity });

/** One portfolio with its counts and the extent of its located stores; off until there is an id. */
export const usePortfolioSummary = (id: number | null) =>
  useQuery({ queryKey: ['portfolio', id], queryFn: () => api<PortfolioSummary>(`/portfolios/${id}`), enabled: id != null, staleTime: Infinity });

/** Uploads one file as multipart. On success the result becomes the session's current portfolio (stepper, setup screen). */
export function useUploadPortfolio() {
  const { setPortfolio } = useCurrentPortfolio();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);                                          // the browser sets the multipart boundary; never set Content-Type by hand
      return api<UploadResult>('/portfolios', { method: 'POST', body: form });
    },
    onSuccess: (result) => setPortfolio(result),
  });
}

/**
 * One market by id, as the API stored it. While discovery is queued or running the query polls every 2 s, then stops by
 * itself. It keeps polling in a background tab too: a run lasts seconds, and someone who switched tabs to wait should come
 * back to the finished state, not to a stale "running".
 */
export const useMarket = (id: number | null) =>
  useQuery({
    queryKey: ['market', id], queryFn: () => api<Market>(`/markets/${id}`), enabled: id != null,
    refetchInterval: (query) => (query.state.data && ['pending', 'running'].includes(query.state.data.status) ? 2000 : false),
    refetchIntervalInBackground: true,
  });

/** Creates the market from the setup screen's decisions. On success it becomes the session's current market. */
export function useCreateMarket() {
  const { setMarket } = useCurrentMarket();
  return useMutation({
    mutationFn: (input: CreateMarket) =>
      api<Market>('/markets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
    onSuccess: (market) => setMarket(market),
  });
}