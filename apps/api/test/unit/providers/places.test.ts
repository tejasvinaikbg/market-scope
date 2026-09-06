/** The resolver: which provider answers a market's choice under each PLACES mode, and the error for Google without a key. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlacesResolver, type PlacesProvider } from '../../../src/providers/places.ts';

const stub = (id: PlacesProvider['id']): PlacesProvider => ({ id, discover: async () => [] });
const overpass = stub('overpass'),
  google = stub('google'),
  fixture = stub('fixture');

test('fixture mode answers every choice with the fixture', () => {
  const resolve = createPlacesResolver('fixture', { overpass, google: null, fixture });
  assert.equal(resolve('overpass'), fixture);
  assert.equal(resolve('google'), fixture);
});

test('live mode honours the choice, and names the fix when Google has no key', () => {
  const resolve = createPlacesResolver('live', { overpass, google, fixture });
  assert.equal(resolve('overpass'), overpass);
  assert.equal(resolve('google'), google);
  const unkeyed = createPlacesResolver('live', { overpass, google: null, fixture });
  assert.equal(unkeyed('overpass'), overpass);
  assert.throws(() => unkeyed('google'), /Google Places API \(New\) is not configured: set GOOGLE_PLACES_API_KEY/);
});
