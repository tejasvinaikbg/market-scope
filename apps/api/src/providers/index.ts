import { join } from 'node:path'
import { config } from '../config.ts'
import type { Geocoder } from './geocoder.ts'
import { createNominatimGeocoder } from './nominatim.ts'
import { createFixtureGeocoder } from './fixture-geocoder.ts'

/** Process-wide: Nominatim's limit is per client, and the throttle lives inside the closure. Two of them would mean 2 req/s. */
export const geocoder: Geocoder = config.GEOCODER === 'fixture' ? createFixtureGeocoder(join(import.meta.dirname, '..', '..', 'fixtures', 'geocode.json')) : createNominatimGeocoder({ userAgent: config.NOMINATIM_USER_AGENT }) 