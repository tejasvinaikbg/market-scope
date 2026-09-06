/**
 * The PlacesProvider contract: give it one tile of the boundary and the search terms for the chosen categories,
 * get back the stores found there. Overpass implements it now; Google Places (New) implements the same shape later,
 * so discovery never knows which one it is talking to.
 */
import type { Bbox } from '@market-scope/shared';

/** One OpenStreetMap tag to match, e.g. { key: 'shop', value: 'supermarket' } — the seed's osm_selectors. */
export interface OsmSelector {
  key: string;
  value: string;
}

/** A chosen category with its search terms, and the id to file every hit under. */
export interface CategorySearch {
  categoryId: number;
  slug: string;
  selectors: OsmSelector[];
}

export interface DiscoveredPlace {
  providerPlaceId: string; // 'node/123' or 'way/456': stable across runs, so a re-run does not duplicate a store
  name: string;
  categoryId: number;
  lat: number;
  lng: number;
  address: string | null;
  tags: Record<string, string>; // everything the source said, kept for the list and for questions later
}

export interface PlacesProvider {
  /** Which source this is. Cache entries and stored rows are keyed by it, so fixture answers never stand in for live ones. */
  readonly id: 'overpass' | 'google' | 'fixture';
  /** Every store in the tile matching any of the categories. One tile is one request; tiling is the caller's job. */
  discover(tile: Bbox, categories: CategorySearch[]): Promise<DiscoveredPlace[]>;
}
