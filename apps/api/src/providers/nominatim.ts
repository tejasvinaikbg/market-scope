/**
 * Nominatim adapter: turns a place name into a bounding box using OpenStreetMap's free geocoder.
 * Owns everything Nominatim-specific — the endpoint, the query shape, and the quirks of its JSON — while the
 * throttle, identification, timeout and retry rules come from lib/http.ts, shared with every other provider.
 */
import { createThrottledFetch, withRetry } from '../lib/http.ts';
import type { Bbox, LatLng } from '@market-scope/shared';
import type { Geocoder, PlaceBounds } from './geocoder.ts';

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string];
}

export interface NominatimOptions {
  userAgent: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Builds a Geocoder backed by OpenStreetMap's Nominatim. Call it once per process (providers/index.ts):
 * the throttle lives in this closure, and one throttle is what keeps the whole app at ≤ 1 request/second.
 */
export function createNominatimGeocoder(opts: NominatimOptions): Geocoder {
  const baseUrl = opts.baseUrl ?? 'https://nominatim.openstreetmap.org';
  const request = createThrottledFetch({ userAgent: opts.userAgent, fetchImpl: opts.fetchImpl, timeoutMs: 15_000 });

  return {
    async lookupBounds(query: string): Promise<PlaceBounds | null> {
      const url = new URL('/search', baseUrl);
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' }).toString();

      const hits = await withRetry(async () => (await request('nominatim', url)).json() as Promise<NominatimHit[]>, { retries: 2, minTimeout: 2000 }); // 2 s, then 4 s
      const hit = hits[0];
      if (!hit) return null;
      const [south, north, west, east] = hit.boundingbox.map(Number) as [number, number, number, number]; // Nominatim's order
      return { bbox: { south, north, west, east }, centre: { lat: Number(hit.lat), lng: Number(hit.lon) }, displayName: hit.display_name };
    },

    async lookupPoint(query: string, within: Bbox): Promise<LatLng | null> {
      const url = new URL('/search', baseUrl);
      // viewbox + bounded=1: only results inside the box count, so "80 Feet Road" resolves in this city and not in another one.
      url.search = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '1',
        viewbox: `${within.west},${within.south},${within.east},${within.north}`,
        bounded: '1',
      }).toString();
      const hits = await withRetry(async () => (await request('nominatim', url)).json() as Promise<NominatimHit[]>, { retries: 2, minTimeout: 2000 });
      const hit = hits[0];
      return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    },
  };
}
