/** Unit tests for provider availability: every combination of switch and key, and the reason the screen shows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProviders, providerUnavailable } from '../../../src/providers/availability.ts';

const defaults = {
  OVERPASS_ENABLED: true,
  NOMINATIM_ENABLED: true,
  GOOGLE_PLACES_API_KEY: undefined,
  GOOGLE_PLACES_ENABLED: true,
  GOOGLE_GEOCODING_API_KEY: undefined,
  GOOGLE_GEOCODING_ENABLED: true,
};
const keyed = { ...defaults, GOOGLE_PLACES_API_KEY: 'k1', GOOGLE_GEOCODING_API_KEY: 'k2' };

test('by default the OSM providers are on and Google is "not configured"', () => {
  const p = listProviders(defaults);
  assert.deepEqual(
    p.places.map((o) => [o.id, o.enabled, o.reason]),
    [
      ['overpass', true, null],
      ['google', false, 'not configured'],
    ],
  );
  assert.deepEqual(
    p.geocoding.map((o) => [o.id, o.enabled, o.reason]),
    [
      ['nominatim', true, null],
      ['google', false, 'not configured'],
    ],
  );
});

test('a key enables a Google provider; every switch disables its own provider and no other', () => {
  assert.equal(listProviders(keyed).places[1]!.enabled, true);
  const placesOff = listProviders({ ...keyed, GOOGLE_PLACES_ENABLED: false });
  assert.deepEqual([placesOff.places[1]!.reason, placesOff.geocoding[1]!.enabled], ['disabled', true]);
  const overpassOff = listProviders({ ...keyed, OVERPASS_ENABLED: false });
  assert.deepEqual(
    overpassOff.places.map((o) => [o.id, o.enabled]),
    [
      ['overpass', false],
      ['google', true],
    ],
  );
  const nominatimOff = listProviders({ ...defaults, NOMINATIM_ENABLED: false });
  assert.deepEqual(
    nominatimOff.geocoding.map((o) => o.reason),
    ['disabled', 'not configured'],
  ); // both off: the screen can offer nothing
});

test('providerUnavailable says why, in the words the screen shows', () => {
  assert.equal(providerUnavailable('places', 'overpass', defaults), null);
  assert.equal(providerUnavailable('places', 'overpass', { ...defaults, OVERPASS_ENABLED: false }), 'OSM Overpass is disabled');
  assert.equal(providerUnavailable('places', 'google', defaults), 'Google Places API (New) is not configured');
  assert.equal(providerUnavailable('geocoding', 'google', { ...keyed, GOOGLE_GEOCODING_ENABLED: false }), 'Google Geocoding API is disabled');
  assert.equal(providerUnavailable('geocoding', 'google', keyed), null);
  assert.match(providerUnavailable('places', 'bing', keyed) ?? '', /unknown places provider/);
});
