/** The fixture provider parses the same elements as the live one and keeps only those inside the tile and the chosen categories. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixturePlacesProvider } from '../../../src/providers/fixture-places.ts';

const provider = createFixturePlacesProvider(new URL('../../../fixtures/overpass.json', import.meta.url).pathname);
const koramangala = { south: 12.92, west: 77.6, north: 12.956, east: 77.646 };

test('filters by tile and by category', async () => {
  const supermarkets = await provider.discover(koramangala, [{ categoryId: 1, slug: 'supermarket', selectors: [{ key: 'shop', value: 'supermarket' }] }]);
  assert.deepEqual(supermarkets.map((p) => p.name).sort(), ['FreshMart Koramangala', 'More']); // "Far Away Mart" is outside the tile
  const pharmacies = await provider.discover(koramangala, [{ categoryId: 2, slug: 'pharmacy', selectors: [{ key: 'amenity', value: 'pharmacy' }] }]);
  assert.deepEqual(pharmacies.map((p) => p.name).sort(), ['Apollo Pharmacy', 'Unnamed pharmacy']);
});
