/**
 * Google Places (New) adapter: asks Text Search for every place of the chosen kinds inside one tile. Owns everything
 * Google-specific — the request body, the field mask that decides the billing SKU, the page tokens, the type list and the
 * split of a crowded rectangle — so discovery only ever sees DiscoveredPlace[]. The throttle, identification, timeout and
 * retry rules come from lib/http.ts, shared with every other provider. The body builder, the parser and the category rule
 * are pure and exported, because they are the parts worth testing without a network.
 *
 * One request asks for one type inside one rectangle and answers at most PAGE_SIZE places, with a token for the next page,
 * up to MAX_PAGES. A rectangle that still has more after the last page is split into quadrants and each is asked again,
 * once (MAX_SPLIT_DEPTH), so a crowded cell is not silently cut at 60 places while a quiet one costs a single request.
 */
import { pointInBbox, type Bbox } from '@market-scope/shared';
import { createThrottledFetch, withRetry } from '../lib/http.ts';
import type { CategorySearch, DiscoveredPlace, PlacesProvider } from './places.ts';

/** The fields the field mask asks for, as Google returns them. */
export interface GooglePlace {
  id: string;
  displayName?: { text?: string; languageCode?: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
}
interface TextSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

export const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
/** Only the fields the product uses. Every field named here can move the request into a dearer billing SKU, so the list is short on purpose. */
export const FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,places.primaryType,places.types,places.businessStatus,nextPageToken';
export const PAGE_SIZE = 20; // Google's maximum per page
export const MAX_PAGES = 3; // Google's maximum per query: 60 places
export const MAX_SPLIT_DEPTH = 1; // a rectangle with more than 60 is split into quadrants once: up to 240 per type per cell

/** The body of one request: one type, one rectangle, strict on the type so "pharmacy" never returns a clinic that mentions one. Pure, unit-tested. */
export function buildTextSearchBody(rect: Bbox, type: string, pageToken?: string) {
  return {
    textQuery: type.replace(/_/g, ' '), // Text Search needs words; the type's own name ranks its kind first
    includedType: type,
    strictTypeFiltering: true,
    pageSize: PAGE_SIZE,
    languageCode: 'en',
    locationRestriction: { rectangle: { low: { latitude: rect.south, longitude: rect.west }, high: { latitude: rect.north, longitude: rect.east } } },
    ...(pageToken ? { pageToken } : {}),
  };
}

/** One Google place → one place under the category given, or null when it has no position or has closed for good. Pure, unit-tested. */
export function toPlace(place: GooglePlace, category: CategorySearch): DiscoveredPlace | null {
  if (!place.location || place.businessStatus === 'CLOSED_PERMANENTLY') return null; // a shop that closed is not a competitor
  const tags: Record<string, string> = {};
  if (place.primaryType) tags.primaryType = place.primaryType;
  if (place.types?.length) tags.types = place.types.join(',');
  if (place.businessStatus) tags.businessStatus = place.businessStatus;
  return {
    providerPlaceId: place.id,
    name: place.displayName?.text || `Unnamed ${category.slug.replace(/_/g, ' ')}`, // a shop with no name is still a shop
    categoryId: category.categoryId,
    lat: place.location.latitude,
    lng: place.location.longitude,
    address: place.formattedAddress ?? null,
    tags,
  };
}

/**
 * Which chosen category a place belongs to when more than one search returned it: the one whose types include the
 * place's primary type ("Reliance Fresh" is a supermarket that also lists grocery_store), else the first that found it.
 */
export function assignCategory(place: GooglePlace, foundBy: CategorySearch[]): CategorySearch {
  return foundBy.find((c) => place.primaryType !== undefined && c.googleTypes.includes(place.primaryType)) ?? foundBy[0]!;
}

/** The four quarters of a rectangle, south-west first. */
export function quadrants(rect: Bbox): Bbox[] {
  const midLat = (rect.south + rect.north) / 2,
    midLng = (rect.west + rect.east) / 2;
  return [
    { south: rect.south, west: rect.west, north: midLat, east: midLng },
    { south: rect.south, west: midLng, north: midLat, east: rect.east },
    { south: midLat, west: rect.west, north: rect.north, east: midLng },
    { south: midLat, west: midLng, north: rect.north, east: rect.east },
  ];
}

/** Google answers a refusal as JSON; the error keeps its status and message instead of the raw body. */
function tidy(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const m = /^(google places \d+): (\{[\s\S]*)$/.exec(err.message);
  if (!m) return err;
  const message = /"message":\s*"((?:[^"\\]|\\.)*)"/.exec(m[2]!)?.[1];
  const status = /"status":\s*"([A-Z_]+)"/.exec(m[2]!)?.[1];
  if (message) err.message = `${m[1]}: ${status ? `${status}: ` : ''}${message}`;
  return err;
}

export interface GooglePlacesOptions {
  apiKey: string;
  userAgent: string;
  url?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Builds a PlacesProvider backed by Google Places (New). Call it once per process (providers/index.ts): the throttle lives
 * in this closure. Google allows far more than the OSM mirrors' one a second; 100 ms keeps a run inside its default quota
 * of 600 requests a minute.
 */
export function createGooglePlacesProvider(opts: GooglePlacesOptions): PlacesProvider {
  const url = opts.url ?? TEXT_SEARCH_URL;
  const request = createThrottledFetch({ userAgent: opts.userAgent, fetchImpl: opts.fetchImpl, minIntervalMs: 100, timeoutMs: 15_000 });

  /** One page of one type in one rectangle, retried on 429 and 5xx. */
  const page = (rect: Bbox, type: string, pageToken?: string): Promise<TextSearchResponse> =>
    withRetry(
      async () => {
        let res: Response;
        try {
          res = await request('google places', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': opts.apiKey, 'X-Goog-FieldMask': FIELD_MASK },
            body: JSON.stringify(buildTextSearchBody(rect, type, pageToken)),
          });
        } catch (err) {
          throw tidy(err);
        }
        return (await res.json()) as TextSearchResponse;
      },
      { retries: 3, minTimeout: 1000 }, // 1 s, 2 s, 4 s
    );

  /** Every place of one type in a rectangle: page through, and split a rectangle that still had more after the last page. */
  async function search(rect: Bbox, type: string, depth: number): Promise<GooglePlace[]> {
    const places: GooglePlace[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const body = await page(rect, type, token);
      places.push(...(body.places ?? []));
      token = body.nextPageToken;
      pages++;
    } while (token && pages < MAX_PAGES);
    if (token && depth < MAX_SPLIT_DEPTH) {
      // too crowded for one query: ask each quarter, keeping what the whole already gave (the caller drops duplicates)
      for (const quarter of quadrants(rect)) places.push(...(await search(quarter, type, depth + 1)));
    }
    return places;
  }

  return {
    id: 'google',
    async discover(tile, categories) {
      // Every type of every category is one search; a place found by several is filed once, under the category that fits it best.
      const foundBy = new Map<string, { place: GooglePlace; categories: CategorySearch[] }>();
      for (const category of categories) {
        for (const type of category.googleTypes) {
          for (const place of await search(tile, type, 0)) {
            const entry = foundBy.get(place.id);
            if (!entry) foundBy.set(place.id, { place, categories: [category] });
            else if (!entry.categories.includes(category)) entry.categories.push(category);
          }
        }
      }
      const out: DiscoveredPlace[] = [];
      for (const { place, categories: found } of foundBy.values()) {
        const p = toPlace(place, assignCategory(place, found));
        if (p && pointInBbox({ lat: p.lat, lng: p.lng }, tile)) out.push(p); // the restriction is strict, but a quarter's answer is checked against the whole all the same
      }
      return out;
    },
  };
}
