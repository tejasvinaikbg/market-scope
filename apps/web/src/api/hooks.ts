'use client';
/** Data hooks, one per endpoint. Reference data never changes within a session (staleTime: Infinity). */
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
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
  matched: number;
};
export type ProviderOption = { id: 'overpass' | 'nominatim' | 'google'; name: string; enabled: boolean; reason: 'not configured' | 'disabled' | null };
export type Providers = { places: ProviderOption[]; geocoding: ProviderOption[] };
export type CreateMarket = { name?: string; portfolioId: number; cityId: number; categoryIds: number[]; boundary: Bbox; placesProvider: Market['placesProvider']; geocoderProvider: Market['geocoderProvider'] };
export type StoreLayer = 'discovered' | 'portfolio_inside' | 'portfolio_outside';
export type Store = {
  id: string; layer: StoreLayer; name: string; category: Category | null; lat: number; lng: number; address: string | null; source: string;
  match: { id: string; name: string; distanceM: number } | null;   // the discovered store this portfolio store is, when one was found
};
export type LayerFilter = StoreLayer | 'matched';                    // 'matched' is asked for beside the layers: the portfolio stores with a partner
export type UnlocatedStore = { id: string; name: string; category: Category | null; address: string | null; reason: 'not_found' | 'error' | null };
export type StoreCounts = { discovered: number; portfolioInside: number; portfolioOutside: number; portfolioUnlocated: number; matched: number };
export type MarketStores = { stores: Store[]; unlocated: UnlocatedStore[]; counts: StoreCounts };
export type StoreFilters = { layers?: LayerFilter[]; categories?: string[]; q?: string };

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

/** Every market, newest first, for the "open a previous market" list. Read fresh on every visit: a run may have ended since. */
export const useMarkets = () => useQuery({ queryKey: ['markets'], queryFn: () => api<Market[]>('/markets'), staleTime: 0 });

/** The stores path with its filters as the API reads them: comma lists, the search trimmed, nothing sent for "everything". */
export function storesPath(id: number, f: StoreFilters) {
  const parts: string[] = [];
  if (f.layers?.length) parts.push(`layers=${f.layers.join(',')}`);
  if (f.categories?.length) parts.push(`categories=${f.categories.join(',')}`);     // slugs are plain letters and underscores
  const q = f.q?.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  return `/markets/${id}/stores${parts.length ? `?${parts.join('&')}` : ''}`;
}

/**
 * The stores a market's dashboard draws, filtered by the API. Off until the market has started. While the run is in flight
 * it re-reads every 2 s beside the market itself, so stores appear as they are found, and once more when the status changes,
 * so the last areas searched are never missed. A new filter keeps the previous list on screen until its own answer arrives.
 */
export const useMarketStores = (id: number | null, filters: StoreFilters, status: Market['status'] | undefined) =>
  useQuery({
    queryKey: ['market-stores', id, storesPath(id ?? 0, filters), status],
    queryFn: () => api<MarketStores>(storesPath(id!, filters)),
    enabled: id != null && status != null && status !== 'pending',
    refetchInterval: status === 'running' ? 2000 : false,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
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