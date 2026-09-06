/**
 * Market creation: the validation ladder, then one transaction. Every rule the setup screen shows live (shape,
 * area cap) is enforced here again, with PostGIS as the measurement — the client's number is only a preview.
 * Also what can be done to a market afterwards: run it again (recovery after gaps, or to bring an older market up to
 * date with what the pipeline does now), edit its decisions (which throws away what was found and runs again), and delete
 * it. None of it while a run is in flight.
 */
import { validateBbox, MAX_MARKET_AREA_SQ_KM, MIN_MARKET_AREA_SQ_KM, type Bbox } from '@market-scope/shared';
import { withTransaction } from '../db/knex.ts';
import { badRequest, notFound, conflict } from '../lib/errors.ts';
import { marketsQueries, type PlacesProvider, type GeocoderProvider } from '../queries/markets.ts';
import { portfoliosQueries } from '../queries/portfolios.ts';
import { citiesQueries } from '../queries/cities.ts';
import { categoriesQueries } from '../queries/categories.ts';
import { storesQueries, type StoreFilters } from '../queries/stores.ts';
import { discoveryQueries } from '../queries/discovery.ts';
import { providerUnavailable } from '../providers/availability.ts';
import { jobsQueries } from '../queries/jobs.ts';

export interface CreateMarketInput {
  name?: string;
  portfolioId: number;
  cityId: number;
  categoryIds: number[];
  boundary: Bbox;
  placesProvider: PlacesProvider;
  geocoderProvider: GeocoderProvider;
}

/** The validation ladder, shared by create and edit: what comes back is what a market row needs beyond the input. */
async function checkMarketInput(input: CreateMarketInput) {
  // 1. Shape: south < north, west < east, within the world. The shared rule, the same one the screen applies.
  const shape = validateBbox(input.boundary);
  if (shape) throw badRequest('INVALID_BOUNDARY', shape);

  // 2. Size: PostGIS measures; the cap and the floor come from the shared constants. The measured value rides in details.
  const areaSqKm = await marketsQueries.areaSqKm(input.boundary);
  if (areaSqKm > MAX_MARKET_AREA_SQ_KM)
    throw badRequest('AREA_TOO_LARGE', `Boundary is ${areaSqKm.toFixed(2)} km²; the cap is ${MAX_MARKET_AREA_SQ_KM} km²`, { areaSqKm });
  if (areaSqKm < MIN_MARKET_AREA_SQ_KM)
    throw badRequest('AREA_TOO_SMALL', `Boundary is ${areaSqKm.toFixed(4)} km²; the minimum is ${MIN_MARKET_AREA_SQ_KM} km²`, { areaSqKm });

  // 3. Providers: the screen greys out what cannot be used, but a request can be made by hand — refuse with the same reason.
  const unavailable = providerUnavailable('places', input.placesProvider) ?? providerUnavailable('geocoding', input.geocoderProvider);
  if (unavailable) throw badRequest('PROVIDER_UNAVAILABLE', `${unavailable}; choose an available data source`);

  // 4. References: the portfolio and city must exist, every category must be a seeded one (duplicates are collapsed, not rejected).
  const portfolio = await portfoliosQueries.summary(input.portfolioId);
  if (!portfolio) throw notFound('portfolio');
  const city = await citiesQueries.byId(input.cityId);
  if (!city) throw notFound('city');
  const categoryIds = [...new Set(input.categoryIds)];
  const known = new Set((await categoriesQueries.list()).map((c) => c.id));
  const unknown = categoryIds.filter((id) => !known.has(id));
  if (unknown.length) throw badRequest('UNKNOWN_CATEGORY', `Unknown category id(s): ${unknown.join(', ')}`, { unknown });

  // The name is optional on the screen (the design has no field for it), so it defaults to something readable.
  const name = input.name?.trim() || `${city.name} · ${portfolio.name}`;
  return {
    name,
    portfolioId: input.portfolioId,
    cityId: input.cityId,
    boundary: input.boundary,
    areaSqKm,
    placesProvider: input.placesProvider,
    geocoderProvider: input.geocoderProvider,
    categoryIds,
  };
}

export async function createMarket(input: CreateMarketInput) {
  const market = await checkMarketInput(input);
  // 5. Store, and queue the work. Same transaction: a market without its job, or a job without its market, cannot exist.
  const id = await withTransaction(async (trx) => {
    const marketId = await marketsQueries.insert(market, trx);
    await jobsQueries.enqueue('market.pipeline', marketId, { marketId }, trx);
    return marketId;
  });
  return (await marketsQueries.byId(id))!;
}

/**
 * Rewrite a market's decisions and run it again. What was found for the old decisions is thrown away first: discovery
 * only ever adds and updates, so a store found inside the old rectangle would otherwise linger outside the new one.
 */
export async function updateMarket(id: number, input: CreateMarketInput) {
  const current = await getMarket(id);
  if (current.busy) throw conflict('RUN_IN_PROGRESS', 'This market is being worked on; wait for it to finish before changing it');
  const market = await checkMarketInput({ ...input, name: input.name ?? current.name });
  await withTransaction(async (trx) => {
    await marketsQueries.update(id, market, trx);
    await discoveryQueries.clearForMarket(id, trx);
    await marketsQueries.reset(id, trx);
    await jobsQueries.enqueue('market.pipeline', id, { marketId: id }, trx);
  });
  return (await marketsQueries.byId(id))!;
}

export async function getMarket(id: number) {
  const market = await marketsQueries.byId(id);
  if (!market) throw notFound('market');
  return market;
}

/** Queue the pipeline again for a market whose run has ended. Same job, same idempotent steps; the rows are rewritten. */
export async function rerunMarket(id: number) {
  const market = await getMarket(id);
  if (market.busy) throw conflict('RUN_IN_PROGRESS', 'This market is already being worked on; wait for it to finish');
  await withTransaction(async (trx) => {
    await marketsQueries.reset(id, trx);
    await jobsQueries.enqueue('market.pipeline', id, { marketId: id }, trx);
  });
  return (await marketsQueries.byId(id))!;
}

/** Delete a market and everything found for it. Not while a run is in flight: the worker would be writing into a hole. */
export async function deleteMarket(id: number) {
  const market = await getMarket(id);
  if (market.busy) throw conflict('RUN_IN_PROGRESS', 'This market is being worked on; wait for it to finish before deleting it');
  await marketsQueries.remove(id);
}

/** Everything the dashboard draws for one market: the filtered list, the unlocated portfolio stores, and the unfiltered totals. */
export async function listMarketStores(id: number, filters: StoreFilters) {
  await getMarket(id); // 404 before any list work
  const [stores, unlocated, counts] = await Promise.all([storesQueries.list(id, filters), storesQueries.unlocated(id), storesQueries.counts(id)]);
  return { stores, unlocated, counts };
}
