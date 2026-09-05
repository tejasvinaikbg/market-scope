/**
 * Offline Geocoder that answers from apps/api/fixtures/geocode.json. Used by tests and when GEOCODER=fixture.
 */
import { readFile } from 'node:fs/promises';
import type { Geocoder, PlaceBounds } from './geocoder.ts';

export function createFixtureGeocoder(path: string): Geocoder {
  let data: Record<string, PlaceBounds> | undefined;
  return {
    async lookupBounds(query) {
      data ??= JSON.parse(await readFile(path, 'utf8'));
      return data![query.toLowerCase()] ?? null;
    },
  };
}