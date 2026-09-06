/** Unit tests for the offline geocoder: case-insensitive lookup from the fixture file, null for unknown places. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFixtureGeocoder } from '../../../src/providers/fixture-geocoder.ts';

const geocoder = createFixtureGeocoder(join(import.meta.dirname, '..', '..', '..', 'fixtures', 'geocode.json'));

test('finds a seeded city regardless of case', async () => {
  const r = await geocoder.lookupBounds('Bengaluru, Karnataka, India');
  assert.ok(r);
  assert.ok(r.bbox.south < r.centre.lat && r.centre.lat < r.bbox.north);
});

test('returns null for an unknown place', async () => {
  assert.equal(await geocoder.lookupBounds('Atlantis'), null);
});

test('lookupPoint answers an address entry only inside the box asked for', async () => {
  const g = createFixtureGeocoder(new URL('../../../fixtures/geocode.json', import.meta.url).pathname);
  const city = { south: 12.83, west: 77.46, north: 13.14, east: 77.78 };
  assert.deepEqual(await g.lookupPoint('ITPL Main Road, Whitefield, Bengaluru, Karnataka, India', city), { lat: 12.9855, lng: 77.7357 });
  assert.equal(await g.lookupPoint('ITPL Main Road, Whitefield, Bengaluru, Karnataka, India', { south: 12.92, west: 77.60, north: 12.956, east: 77.646 }), null);   // outside Koramangala
  assert.equal(await g.lookupPoint('No Such Road, Bengaluru, Karnataka, India', city), null);
});