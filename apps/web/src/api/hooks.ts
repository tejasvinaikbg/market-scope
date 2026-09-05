'use client';
import { useQuery } from '@tanstack/react-query';
import type { Bbox, LatLng } from '@market-scope/shared';
import { api } from './client';

export type City = { id: number; name: string };
export type State = { id: number; name: string; cities: City[] };
export type Country = { id: number; name: string; states: State[] };
export type Category = { id: number; slug: string; name: string };
export type CityBounds = { cityId: number; name: string; bbox: Bbox; centre: LatLng; cached: boolean };

export const useLocations = () => useQuery({ queryKey: ['locations'], queryFn: () => api<{ countries: Country[] }>('/locations'), staleTime: Infinity });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories'), staleTime: Infinity });
export const useCityBounds = (cityId: number | null) =>
  useQuery({ queryKey: ['city-bbox', cityId], queryFn: () => api<CityBounds>(`/cities/${cityId}/bbox`), enabled: cityId != null, staleTime: Infinity });