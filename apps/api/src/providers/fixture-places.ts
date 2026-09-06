/**
 * Offline PlacesProvider that answers from apps/api/fixtures/overpass.json — raw Overpass elements, parsed by the same
 * toPlace as the live adapter and filtered to the tile, so tests and PLACES=fixture behave like Overpass without a network.
 */
import { readFile } from 'node:fs/promises';
import { pointInBbox } from '@market-scope/shared';
import { toPlace } from './overpass.ts';
import type { DiscoveredPlace, PlacesProvider } from './places.ts';

export function createFixturePlacesProvider(path: string): PlacesProvider {
  let elements: Parameters<typeof toPlace>[0][] | undefined;
  return {
    id: 'fixture',
    async discover(tile, categories) {
      elements ??= (JSON.parse(await readFile(path, 'utf8')) as { elements: Parameters<typeof toPlace>[0][] }).elements;
      return elements.map((el) => toPlace(el, categories)).filter((p): p is DiscoveredPlace => p !== null && pointInBbox({ lat: p.lat, lng: p.lng }, tile));
    },
  };
}
