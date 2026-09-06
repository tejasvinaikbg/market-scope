'use client';
/** Data hooks, one per endpoint. Reference data never changes within a session (staleTime: Infinity). */
import { useQuery, useMutation } from '@tanstack/react-query';
import type { Bbox, LatLng, FileIssue } from '@market-scope/shared';
import { api } from './client';
import { useCurrentPortfolio } from '@/app/providers';

export type City = { id: number; name: string };
export type State = { id: number; name: string; cities: City[] };
export type Country = { id: number; name: string; states: State[] };
export type Category = { id: number; slug: string; name: string };
export type CityBounds = { cityId: number; name: string; bbox: Bbox; centre: LatLng; cached: boolean };
export type Portfolio = { id: number; name: string; sourceFilename: string; rowCount: number; createdAt: string };
export type PortfolioSummary = Portfolio & { withCoords: number; withoutCoords: number };
export type UploadResult = PortfolioSummary & { warnings: FileIssue[] };

export const useLocations = () => useQuery({ queryKey: ['locations'], queryFn: () => api<{ countries: Country[] }>('/locations'), staleTime: Infinity });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories'), staleTime: Infinity });
export const useCityBounds = (cityId: number | null) =>
  useQuery({ queryKey: ['city-bbox', cityId], queryFn: () => api<CityBounds>(`/cities/${cityId}/bbox`), enabled: cityId != null, staleTime: Infinity });

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
