/**
 * The process-wide provider instances. One of each on purpose: the throttles live inside the closures, and one throttle
 * is what keeps the whole app inside each service's limit. Two instances would mean twice the rate. The jobs hand each
 * market's choices to `placesFor` and `geocoderFor`; a Google provider exists only when its key is configured.
 */
import { join } from 'node:path';
import { config } from '../config.ts';
import { createGeocoderResolver, type Geocoder, type GeocoderResolver } from './geocoder.ts';
import { createPlacesResolver, type PlacesResolver } from './places.ts';
import { createNominatimGeocoder } from './nominatim.ts';
import { createGoogleGeocoder } from './google-geocoder.ts';
import { createFixtureGeocoder } from './fixture-geocoder.ts';
import { createOverpassProvider } from './overpass.ts';
import { createGooglePlacesProvider } from './google-places.ts';
import { createFixturePlacesProvider } from './fixture-places.ts';

const fixtures = join(import.meta.dirname, '..', '..', 'fixtures');
/** The same contact string identifies us to every service, as the OpenStreetMap usage policies ask. */
const userAgent = config.NOMINATIM_USER_AGENT;

const nominatim = createNominatimGeocoder({ userAgent });
const fixtureGeocoder = createFixtureGeocoder(join(fixtures, 'geocode.json'));

/** The geocoder for reference data — a city's box, asked for before any market exists to choose: Nominatim, or the fixture. */
export const geocoder: Geocoder = config.GEOCODER === 'fixture' ? fixtureGeocoder : nominatim;

/** The geocoder that locates a market's addresses, by the market's choice. */
export const geocoderFor: GeocoderResolver = createGeocoderResolver(config.GEOCODER, {
  nominatim,
  google: config.GOOGLE_GEOCODING_API_KEY ? createGoogleGeocoder({ apiKey: config.GOOGLE_GEOCODING_API_KEY, userAgent }) : null,
  fixture: fixtureGeocoder,
});

/** The store source that discovers a market's stores, by the market's choice. */
export const placesFor: PlacesResolver = createPlacesResolver(config.PLACES, {
  overpass: createOverpassProvider({ userAgent, endpoints: config.OVERPASS_URLS }),
  google: config.GOOGLE_PLACES_API_KEY ? createGooglePlacesProvider({ apiKey: config.GOOGLE_PLACES_API_KEY, userAgent }) : null,
  fixture: createFixturePlacesProvider(join(fixtures, 'overpass.json')),
});
