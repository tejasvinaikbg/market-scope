/**
 * Offline Geocoder that answers from apps/api/fixtures/geocode.json. Used by tests and when GEOCODER=fixture.
 * City entries carry a box and a centre; address entries carry only a point. A point outside the box asked for is "not found",
 * as it would be with bounded=1 on Nominatim.
 */
import { readFile } from 'node:fs/promises';
import { pointInBbox, type Bbox, type LatLng } from '@market-scope/shared';
import type { Geocoder, PlaceBounds } from './geocoder.ts';

type Entry = Partial<PlaceBounds> & { centre: LatLng };

export function createFixtureGeocoder(path: string): Geocoder {
  let data: Record<string, Entry> | undefined;
  const load = async () => (data ??= JSON.parse(await readFile(path, 'utf8')));
  return {
    async lookupBounds(query) {
      const entry = (await load())[query.toLowerCase()];
      return entry?.bbox ? { bbox: entry.bbox, centre: entry.centre, displayName: entry.displayName ?? query } : null;
    },
    async lookupPoint(query, within: Bbox) {
      const entry = (await load())[query.toLowerCase()];
      return entry && pointInBbox(entry.centre, within) ? entry.centre : null;
    },
  };
}