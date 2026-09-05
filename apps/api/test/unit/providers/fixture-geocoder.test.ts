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
