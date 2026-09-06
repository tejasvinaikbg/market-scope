/** The one resolver rule, and the two resolvers built on it: fixture answers everyone, live honours the choice, a missing key names the fix. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../../../src/providers/resolve.ts';
import { createGeocoderResolver, type Geocoder } from '../../../src/providers/geocoder.ts';

test("createResolver: fixture mode ignores the choice; live returns the choice or throws the caller's sentence", () => {
  const live = { a: 'A', b: null };
  assert.equal(createResolver('fixture', live, 'F', () => 'x')('b'), 'F');
  assert.equal(createResolver('live', live, 'F', () => 'x')('a'), 'A');
  assert.throws(() => createResolver('live', live, 'F', (c) => `no ${c}`)('b'), /^Error: no b$/);
});

test('the geocoder resolver names its own fix', () => {
  const stub = (): Geocoder => ({ lookupBounds: async () => null, lookupPoint: async () => null });
  const nominatim = stub(),
    fixture = stub();
  const resolve = createGeocoderResolver('live', { nominatim, google: null, fixture });
  assert.equal(resolve('nominatim'), nominatim);
  assert.throws(() => resolve('google'), /Google Geocoding API is not configured: set GOOGLE_GEOCODING_API_KEY/);
  assert.equal(createGeocoderResolver('fixture', { nominatim, google: null, fixture })('google'), fixture);
});
