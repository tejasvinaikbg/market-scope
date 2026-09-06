/**
 * The Geocoder contract: two questions. "Where is this city?" answers with a bounding box (the market setup screen);
 * "where is this address, within this box?" answers with a point (placing portfolio stores). Nominatim implements both;
 * a fixture implements both for tests.
 */
import type { Bbox, LatLng } from '@market-scope/shared';

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
