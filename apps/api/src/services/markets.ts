/**
 * Market creation: the validation ladder, then one transaction. Every rule the setup screen shows live (shape,
 * area cap) is enforced here again, with PostGIS as the measurement — the client's number is only a preview.
 */
import { validateBbox, MAX_MARKET_AREA_SQ_KM, MIN_MARKET_AREA_SQ_KM, type Bbox } from '@market-scope/shared';
import { withTransaction } from '../db/knex.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { marketsQueries, type PlacesProvider, type GeocoderProvider } from '../queries/markets.ts';
import { portfoliosQueries } from '../queries/portfolios.ts';
import { citiesQueries } from '../queries/cities.ts';
import { categoriesQueries } from '../queries/categories.ts';

export interface CreateMarketInput {
  name?: string; portfolioId: number; cityId: number; categoryIds: number[]; boundary: Bbox;
  placesProvider: PlacesProvider; geocoderProvider: GeocoderProvider;
}

export async function createMarket(input: CreateMarketInput) {
  // 1. Shape: south < north, west < east, within the world. The shared rule, the same one the screen applies.
  const shape = validateBbox(input.boundary);
  if (shape) throw badRequest('INVALID_BOUNDARY', shape);

  // 2. Size: PostGIS measures; the cap and the floor come from the shared constants. The measured value rides in details.
  const areaSqKm = await marketsQueries.areaSqKm(input.boundary);
  if (areaSqKm > MAX_MARKET_AREA_SQ_KM) throw badRequest('AREA_TOO_LARGE', `Boundary is ${areaSqKm.toFixed(2)} km²; the cap is ${MAX_MARKET_AREA_SQ_KM} km²`, { areaSqKm });
  if (areaSqKm < MIN_MARKET_AREA_SQ_KM) throw badRequest('AREA_TOO_SMALL', `Boundary is ${areaSqKm.toFixed(4)} km²; the minimum is ${MIN_MARKET_AREA_SQ_KM} km²`, { areaSqKm });

  // 3. Providers: offered by the design, not configured yet. A clear refusal beats a silent fallback to OSM.
  if (input.placesProvider === 'google' || input.geocoderProvider === 'google') {
    throw badRequest('PROVIDER_UNAVAILABLE', 'Google providers are not configured yet; choose OSM Overpass and OSM Nominatim');
  }

  // 4. References: the portfolio and city must exist, every category must be a seeded one (duplicates are collapsed, not rejected).
  const portfolio = await portfoliosQueries.summary(input.portfolioId);
  if (!portfolio) throw notFound('portfolio');
  const city = await citiesQueries.byId(input.cityId);
  if (!city) throw notFound('city');
  const categoryIds = [...new Set(input.categoryIds)];
  const known = new Set((await categoriesQueries.list()).map((c) => c.id));
  const unknown = categoryIds.filter((id) => !known.has(id));
  if (unknown.length) throw badRequest('UNKNOWN_CATEGORY', `Unknown category id(s): ${unknown.join(', ')}`, { unknown });

  // 5. Store. The name is optional on the screen (the design has no field for it), so it defaults to something readable.
  const name = input.name?.trim() || `${city.name} · ${portfolio.name}`;
  const id = await withTransaction((trx) => marketsQueries.insert({
    name, portfolioId: input.portfolioId, cityId: input.cityId, boundary: input.boundary, areaSqKm,
    placesProvider: input.placesProvider, geocoderProvider: input.geocoderProvider, categoryIds,
  }, trx));
  return (await marketsQueries.byId(id))!;
}

export async function getMarket(id: number) {
  const market = await marketsQueries.byId(id);
  if (!market) throw notFound('market');
  return market;
}