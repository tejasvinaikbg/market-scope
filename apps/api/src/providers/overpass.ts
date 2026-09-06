/**
 * Overpass adapter: asks OpenStreetMap's query service for every shop of the chosen kinds inside one tile.
 * Owns everything Overpass-specific — its query language, its habit of answering a timed-out query with HTTP 200
 * plus a "remark", and its public mirrors — so discovery only ever sees DiscoveredPlace[]. The throttle,
 * identification, timeout and retry rules come from lib/http.ts, shared with every other provider. The query builder
 * and the element parser are pure and exported, because they are the parts worth testing without a network.
 */
import type { Bbox } from '@market-scope/shared';
import { createThrottledFetch, withRetry, retryable } from '../lib/http.ts';
import type { CategorySearch, DiscoveredPlace, PlacesProvider } from './places.ts';

interface OverpassElement { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

/** Overpass QL string literal: backslashes and double quotes are the only characters that need escaping. */
const literal = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * The query for one tile: every selector as a node clause and a way clause (a supermarket is a point or a building
 * outline), all inside the tile, answered as JSON with a centre point for ways and the tags. Pure, so it is unit-tested.
 */
export function buildOverpassQuery(tile: Bbox, categories: CategorySearch[], timeoutSec = 25): string {
  const box = `${tile.south},${tile.west},${tile.north},${tile.east}`;                         // Overpass wants south,west,north,east
  const clauses = categories.flatMap((c) => c.selectors.flatMap((s) => [
    `node["${literal(s.key)}"="${literal(s.value)}"](${box});`,
    `way["${literal(s.key)}"="${literal(s.value)}"](${box});`,
  ]));
  return `[out:json][timeout:${timeoutSec}];(${clauses.join('')});out center tags;`;
}

const ADDRESS_KEYS = ['addr:housenumber', 'addr:housename', 'addr:street', 'addr:suburb', 'addr:city', 'addr:postcode'];

/** One element → one place, or null when it has no position or matches none of the categories. Pure, unit-tested. */
export function toPlace(el: OverpassElement, categories: CategorySearch[]): DiscoveredPlace | null {
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;   // nodes carry lat/lon; ways carry a centre
  if (lat === undefined || lng === undefined) return null;
  const tags = el.tags ?? {};
  const category = categories.find((c) => c.selectors.some((s) => tags[s.key] === s.value));
  if (!category) return null;
  const address = ADDRESS_KEYS.map((k) => tags[k]).filter(Boolean).join(', ') || null;
  return {
    providerPlaceId: `${el.type}/${el.id}`,
    name: tags.name ?? tags.brand ?? `Unnamed ${category.slug.replace(/_/g, ' ')}`,   // a shop with no name is still a shop
    categoryId: category.categoryId, lat, lng, address, tags,
  };
}

export interface OverpassOptions { userAgent: string; endpoints?: string[]; fetchImpl?: typeof fetch }

export const DEFAULT_OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/**
 * Builds a PlacesProvider backed by Overpass. Call it once per process (providers/index.ts): the throttle lives in
 * this closure, and one throttle is what keeps the whole app under the public instances' limit.
 */
export function createOverpassProvider(opts: OverpassOptions): PlacesProvider {
  const endpoints = opts.endpoints ?? DEFAULT_OVERPASS_ENDPOINTS;
  const request = createThrottledFetch({ userAgent: opts.userAgent, fetchImpl: opts.fetchImpl, timeoutMs: 40_000 });   // a little above the query's own 25 s

  /** One attempt against one mirror. Mirrors rotate with the attempt number, so a busy one does not block the run. */
  async function fetchOnce(query: string, attempt: number): Promise<OverpassElement[]> {
    const endpoint = endpoints[(attempt - 1) % endpoints.length]!;
    const res = await request('overpass', endpoint, { method: 'POST', body: new URLSearchParams({ data: query }) });
    const body = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
    // A query that ran out of time comes back as HTTP 200 with a remark and no elements. That is transient, not "no shops".
    if (body.remark && /timed out|out of memory/i.test(body.remark)) throw retryable(`overpass remark: ${body.remark}`);
    return body.elements ?? [];
  }

  return {
    async discover(tile, categories) {
      if (categories.length === 0) return [];
      const query = buildOverpassQuery(tile, categories);
      const elements = await withRetry((attempt) => fetchOnce(query, attempt), { retries: 3, minTimeout: 1500 });   // 1.5 s, 3 s, 6 s
      return elements.map((el) => toPlace(el, categories)).filter((p): p is DiscoveredPlace => p !== null);
    },
  };
}
