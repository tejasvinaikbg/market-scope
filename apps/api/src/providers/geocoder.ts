/**
 * The Geocoder contract: two questions. "Where is this city?" answers with a bounding box (the market setup screen);
 * "where is this address, within this box?" answers with a point (placing portfolio stores). Nominatim and Google
 * Geocoding implement both; a fixture implements both for tests. A market chooses which one locates its addresses, and
 * the geocoding job hands that choice to the resolver.
 */
import type { Bbox, LatLng } from '@market-scope/shared';
import { createResolver, type Resolver } from './resolve.ts';

export interface PlaceBounds {
  bbox: Bbox;
  centre: LatLng;
  displayName: string;
}

export interface Geocoder {
  lookupBounds(query: string): Promise<PlaceBounds | null>;
  /** The point for an address, searched only inside `within` (the city's box), or null when nothing there matches. */
  lookupPoint(query: string, within: Bbox): Promise<LatLng | null>;
}

/** What a market chose on the setup screen for address lookup: the two names the screen offers. */
export type GeocoderChoice = 'nominatim' | 'google';
/** The geocoder that answers one market's choice. */
export type GeocoderResolver = Resolver<GeocoderChoice, Geocoder>;

/** Turns a market's choice into a geocoder (the rule is in resolve.ts); Google without a key names the fix. */
export const createGeocoderResolver = (
  mode: 'live' | 'fixture',
  providers: { nominatim: Geocoder; google: Geocoder | null; fixture: Geocoder },
): GeocoderResolver =>
  createResolver(
    mode,
    { nominatim: providers.nominatim, google: providers.google },
    providers.fixture,
    () => 'Google Geocoding API is not configured: set GOOGLE_GEOCODING_API_KEY, or edit the market to use OSM Nominatim',
  );
