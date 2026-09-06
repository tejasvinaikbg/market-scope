/**
 * The PlacesProvider contract: give it one tile of the boundary and the search terms for the chosen categories, get back
 * the stores found there. Overpass and Google Places (New) implement it; the fixture answers from a file. Discovery never
 * knows which one it is talking to: it hands the market's choice to the resolver and gets a provider back.
 */
import type { Bbox } from '@market-scope/shared';
import { createResolver, type Resolver } from './resolve.ts';

/** One OpenStreetMap tag to match, e.g. { key: 'shop', value: 'supermarket' } — the seed's osm_selectors. */
export interface OsmSelector {
  key: string;
  value: string;
}

/** A chosen category with its search terms for every source, and the id to file every hit under. */
export interface CategorySearch {
  categoryId: number;
  slug: string;
  selectors: OsmSelector[]; // OpenStreetMap tags — the seed's osm_selectors
  googleTypes: string[]; // Google place types, e.g. 'pharmacy', 'drugstore' — the seed's google_types
}

export interface DiscoveredPlace {
  providerPlaceId: string; // the source's own id ('node/123', 'way/456', a Google place id): stable across runs, so a re-run does not duplicate a store
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
  /** Every store in the tile matching any of the categories. One tile is one question; tiling is the caller's job. */
  discover(tile: Bbox, categories: CategorySearch[]): Promise<DiscoveredPlace[]>;
}

/** What a market chose on the setup screen: the two names the screen offers. */
export type PlacesChoice = 'overpass' | 'google';
/** The provider that answers one market's choice. */
export type PlacesResolver = Resolver<PlacesChoice, PlacesProvider>;

/**
 * Turns a market's choice into a provider (the rule is in resolve.ts). Google without a key is a plain error: the setup
 * screen and the create request both refuse that choice, so it only happens when the key was removed after the market
 * was made — the message says what to do.
 */
export const createPlacesResolver = (
  mode: 'live' | 'fixture',
  providers: { overpass: PlacesProvider; google: PlacesProvider | null; fixture: PlacesProvider },
): PlacesResolver =>
  createResolver(
    mode,
    { overpass: providers.overpass, google: providers.google },
    providers.fixture,
    () => 'Google Places API (New) is not configured: set GOOGLE_PLACES_API_KEY, or edit the market to use OSM Overpass',
  );
