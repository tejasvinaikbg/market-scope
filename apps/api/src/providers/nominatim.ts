/**
 * Nominatim adapter: turns a place name into a bounding box using OpenStreetMap's free geocoder.
 * Owns everything Nominatim-specific — its usage policy (≤ 1 request/second, identifying User-Agent),
 * transient-failure retries, and the quirks of its JSON — so nothing else in the app has to know them.
 */
import pThrottle from 'p-throttle';
import pRetry from 'p-retry';
import type { Geocoder, PlaceBounds } from './geocoder.ts';

interface NominatimHit { lat: string; lon: string; display_name: string; boundingbox: [string, string, string, string] }

// A transient failure (429, 5xx, timeout) is marked so the retry policy can tell it from a final one (4xx).
const retryable = (message: string): Error & { retryable: true } => Object.assign(new Error(message), { retryable: true as const });
const isRetryable = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { retryable?: boolean }).retryable === true;

export interface NominatimOptions { userAgent: string; baseUrl?: string; fetchImpl?: typeof fetch }

/**
 * Builds a Geocoder backed by OpenStreetMap's Nominatim. Call it once per process (providers/index.ts):
 * the throttle lives in this closure, and one throttle is what keeps the whole app at ≤ 1 request/second.
 */
export function createNominatimGeocoder(opts: NominatimOptions): Geocoder {
  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? 'https://nominatim.openstreetmap.org';

  const fetchThrottled = pThrottle({ limit: 1, interval: 1100 })((url: URL) =>
    doFetch(url, { headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }));

  async function fetchOnce(url: URL): Promise<NominatimHit[]> {
    let res: Response;
    try { res = await fetchThrottled(url); }                          // each attempt takes its own throttle slot
    catch (err) { throw retryable(`nominatim network error: ${(err as Error).message}`); }
    if (res.status === 429 || res.status >= 500) throw retryable(`nominatim ${res.status}`);
    if (!res.ok) throw new Error(`nominatim ${res.status}: ${await res.text()}`);
    return (await res.json()) as NominatimHit[];
  }

  return {
    async lookupBounds(query: string): Promise<PlaceBounds | null> {
      const url = new URL('/search', baseUrl);
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' }).toString();

      const hits = await pRetry(() => fetchOnce(url), {
        retries: 2, minTimeout: 2000, factor: 2,                       // 2 s, then 4 s
        shouldRetry: ({ error }) => isRetryable(error),   // 429/5xx/timeout yes; 4xx no
      });
      const hit = hits[0];
      if (!hit) return null;
      const [south, north, west, east] = hit.boundingbox.map(Number) as [number, number, number, number];   // Nominatim's order
      return { bbox: { south, north, west, east }, centre: { lat: Number(hit.lat), lng: Number(hit.lon) }, displayName: hit.display_name };
    },
  };
}
