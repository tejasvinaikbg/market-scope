/**
 * The process-wide provider instances. One of each on purpose: the throttles live inside the closures, and one throttle
 * is what keeps the whole app inside each service's limit. Two instances would mean twice the rate.
 */
import { join } from 'node:path';
import { config } from '../config.ts';
import type { Geocoder } from './geocoder.ts';
import type { PlacesProvider } from './places.ts';
import { createNominatimGeocoder } from './nominatim.ts';
import { createFixtureGeocoder } from './fixture-geocoder.ts';
import { createOverpassProvider } from './overpass.ts';
import { createFixturePlacesProvider } from './fixture-places.ts';

const fixtures = join(import.meta.dirname, '..', '..', 'fixtures');

export const geocoder: Geocoder = config.GEOCODER === 'fixture'
  ? createFixtureGeocoder(join(fixtures, 'geocode.json'))
  : createNominatimGeocoder({ userAgent: config.NOMINATIM_USER_AGENT });

/** The same contact string identifies us to every OpenStreetMap service, as their usage policies ask. */
export const places: PlacesProvider = config.PLACES === 'fixture'
  ? createFixturePlacesProvider(join(fixtures, 'overpass.json'))
  : createOverpassProvider({ userAgent: config.NOMINATIM_USER_AGENT, endpoints: config.OVERPASS_URLS });
