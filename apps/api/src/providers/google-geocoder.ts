/**
 * Google Geocoding adapter: turns a city name into a bounding box and an address into a point. Owns everything
 * Google-specific — the query string, the `bounds` bias, and the status word Google puts inside an HTTP 200 — so the rest
 * of the code only ever sees PlaceBounds and LatLng. The throttle, identification, timeout and retry rules come from
 * lib/http.ts, shared with every other provider. The URL builder, the parsers and the status rule are pure and exported,
 * because they are the parts worth testing without a network.
 *
 * Two rules keep a guess out of the data. `bounds` is a bias, not a fence, so a point outside the box asked for is "not
 * found" — Nominatim's bounded search would have said the same. And a `partial_match` or an APPROXIMATE point — Google's
 * words for "something like this" and "the middle of this area" — is "not found" too: a store placed at the middle of
 * its city would be paired with whatever stands there.
 */
import { pointInBbox, type Bbox, type LatLng } from '@market-scope/shared';
import { createThrottledFetch, withRetry, retryable } from '../lib/http.ts';
import type { Geocoder, PlaceBounds } from './geocoder.ts';

interface Corners {
  northeast: LatLngLiteral;
  southwest: LatLngLiteral;
}
interface LatLngLiteral {
  lat: number;
  lng: number;
}
/** One result, as far as this adapter reads it. */
export interface GoogleGeocodeResult {
  formatted_address: string;
  geometry: {
    location: LatLngLiteral;
    location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
    bounds?: Corners; // an area's extent, when it has one (a city, a road)
    viewport: Corners; // always: the box to show it in
  };
  types?: string[];
  partial_match?: boolean; // Google could not match the whole address and answered with something like it
}
export interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
  error_message?: string;
}

export const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/** The request for one address, biased to a box when one is given (Google wants south,west|north,east). Pure, unit-tested. */
export function buildGeocodeUrl(base: string, apiKey: string, address: string, within?: Bbox): URL {
  const url = new URL(base);
  url.searchParams.set('address', address);
  if (within) url.searchParams.set('bounds', `${within.south},${within.west}|${within.north},${within.east}`);
  url.searchParams.set('key', apiKey);
  return url;
}

/** A result as a city's box: Google's `bounds` when it has them, else the viewport; the centre is its location. Pure, unit-tested. */
export function toBounds(r: GoogleGeocodeResult): PlaceBounds {
  const box = r.geometry.bounds ?? r.geometry.viewport;
  return {
    bbox: { south: box.southwest.lat, west: box.southwest.lng, north: box.northeast.lat, east: box.northeast.lng },
    centre: r.geometry.location,
    displayName: r.formatted_address,
  };
}

/** A result as a store's point, or null when it is a guess or lies outside the box asked for. Pure, unit-tested. */
export function toPoint(r: GoogleGeocodeResult, within: Bbox): LatLng | null {
  if (r.partial_match || r.geometry.location_type === 'APPROXIMATE') return null;
  return pointInBbox(r.geometry.location, within) ? r.geometry.location : null;
}

/** Google answers HTTP 200 with a status word: OK and "nothing" give results, two are worth another try, the rest are final. */
export function checkStatus(body: GoogleGeocodeResponse): GoogleGeocodeResult[] {
  if (body.status === 'OK') return body.results ?? [];
  if (body.status === 'ZERO_RESULTS') return [];
  const message = `google geocoding ${body.status}${body.error_message ? `: ${body.error_message}` : ''}`;
  if (body.status === 'OVER_QUERY_LIMIT' || body.status === 'UNKNOWN_ERROR') throw retryable(message);
  throw new Error(message); // REQUEST_DENIED, INVALID_REQUEST, OVER_DAILY_LIMIT: a configuration or a bill, not a moment
}

export interface GoogleGeocoderOptions {
  apiKey: string;
  userAgent: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Builds a Geocoder backed by Google Geocoding. Call it once per process (providers/index.ts): the throttle lives in
 * this closure. 100 ms between requests keeps a run far inside Google's default quota of 3,000 a minute.
 */
export function createGoogleGeocoder(opts: GoogleGeocoderOptions): Geocoder {
  const base = opts.baseUrl ?? GEOCODE_URL;
  const request = createThrottledFetch({ userAgent: opts.userAgent, fetchImpl: opts.fetchImpl, minIntervalMs: 100, timeoutMs: 15_000 });
  const ask = (address: string, within?: Bbox) =>
    withRetry(
      async () => checkStatus((await (await request('google geocoding', buildGeocodeUrl(base, opts.apiKey, address, within))).json()) as GoogleGeocodeResponse),
      {
        retries: 2,
        minTimeout: 1000, // 1 s, then 2 s
      },
    );

  return {
    async lookupBounds(query) {
      const [first] = await ask(query);
      return first ? toBounds(first) : null;
    },
    async lookupPoint(query, within) {
      const [first] = await ask(query, within);
      return first ? toPoint(first, within) : null;
    },
  };
}
