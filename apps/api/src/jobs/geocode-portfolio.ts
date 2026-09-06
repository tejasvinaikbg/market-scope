/**
 * The geocoding step: every portfolio store uploaded without coordinates is looked up by its address, inside the city's
 * box, by the geocoder the market chose, and gets a point or a reason it has none. It runs before discovery so the
 * dashboard can place portfolio stores as soon as the market is ready. Idempotent: a store that already has a point is
 * never asked about again, so a re-run only retries the ones that failed. One address per second is Nominatim's limit,
 * which is why this is a job and not a request.
 */
import { getCityBounds } from '../services/cities.ts';
import { geocoderFor } from '../providers/index.ts';
import type { Geocoder, GeocoderResolver } from '../providers/geocoder.ts';
import { marketsQueries } from '../queries/markets.ts';
import { portfoliosQueries } from '../queries/portfolios.ts';
import { logger } from '../lib/logger.ts';

export interface GeocodeDeps {
  geocoder: Geocoder | GeocoderResolver; // one geocoder for every market (tests), or the resolver that honours each market's choice
  log: (message: string, meta?: Record<string, unknown>) => void;
}
export interface GeocodeResult {
  total: number;
  located: number;
  notFound: number;
  errors: number;
  status: 'done' | 'failed'; // failed: the market's geocoder is not configured; the market says so, and the pipeline stops
}

const defaults: GeocodeDeps = { geocoder: geocoderFor, log: (message, meta) => logger.info(meta ?? {}, message) };

export async function geocodePortfolio(marketId: number, deps: GeocodeDeps = defaults): Promise<GeocodeResult> {
  const market = await marketsQueries.byId(marketId);
  if (!market) throw new Error(`market ${marketId} not found`);
  let geocoder: Geocoder;
  try {
    geocoder = typeof deps.geocoder === 'function' ? deps.geocoder(market.geocoderProvider) : deps.geocoder;
  } catch (err) {
    // the geocoder the market chose is no longer configured: say so on the market rather than retry a job that cannot succeed
    await marketsQueries.setStatus(marketId, 'failed', (err as Error).message);
    return { total: 0, located: 0, notFound: 0, errors: 0, status: 'failed' };
  }
  const city = await getCityBounds(market.cityId); // cached on the city row since the setup screen asked
  const stores = await portfoliosQueries.storesToGeocode(market.portfolioId);
  const result: GeocodeResult = { total: stores.length, located: 0, notFound: 0, errors: 0, status: 'done' };

  for (const store of stores) {
    const query = `${store.address}, ${store.city}, ${store.state}, ${store.country}`;
    try {
      const point = await geocoder.lookupPoint(query, city.bbox); // throttled inside the geocoder
      if (point) {
        await portfoliosQueries.setGeocoded(store.id, point);
        result.located++;
      } else {
        await portfoliosQueries.setGeocodeStatus(store.id, 'not_found');
        result.notFound++;
      }
      deps.log('geocode store', { marketId, geocoder: market.geocoderProvider, storeId: store.id, found: !!point });
    } catch (err) {
      await portfoliosQueries.setGeocodeStatus(store.id, 'error'); // after the client's retries; the next run tries again
      result.errors++;
      deps.log('geocode store failed', { marketId, geocoder: market.geocoderProvider, storeId: store.id, error: (err as Error).message });
    }
  }
  return result;
}
