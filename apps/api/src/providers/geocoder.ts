/**
 * The Geocoder contract: give it a place name, get back a bounding box (or null). Nominatim implements it; a fixture implements it for tests.
 */
import type { Bbox, LatLng } from '@market-scope/shared'

export interface PlaceBounds { bbox: Bbox; centre: LatLng; displayName: string }

export interface Geocoder {
  lookupBounds(query: string): Promise<PlaceBounds | null>
}