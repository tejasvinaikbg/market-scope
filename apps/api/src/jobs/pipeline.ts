/**
 * What "create the market" kicks off, in order: locate the portfolio's stores that came without coordinates, place every
 * portfolio store inside or outside the rectangle, then discover the stores around them and pair each portfolio store with
 * the discovered store it is (matching runs inside discovery, before the status flips). Each step is idempotent, so a re-run
 * of the whole pipeline is always safe. The market is 'running' from the first step; discovery decides the terminal status,
 * unless the first step found the market's geocoder unconfigured, in which case the market is already failed and says why.
 */
import { marketsQueries } from '../queries/markets.ts';
import { geocodePortfolio, type GeocodeDeps } from './geocode-portfolio.ts';
import { placePortfolio } from './place-portfolio.ts';
import { discoverStores, type DiscoveryDeps } from './discover-stores.ts';

export const MARKET_PIPELINE = 'market.pipeline';

/** Tests inject a step's dependencies; the worker runs with each step's defaults. */
export interface PipelineDeps {
  geocode?: GeocodeDeps;
  discover?: DiscoveryDeps;
}

export async function runPipeline(marketId: number, deps: PipelineDeps = {}): Promise<void> {
  await marketsQueries.setStatus(marketId, 'running');
  const geocoded = await geocodePortfolio(marketId, deps.geocode);
  if (geocoded.status === 'failed') return; // the market carries the reason; nothing after this could succeed
  await placePortfolio(marketId);
  await discoverStores(marketId, deps.discover);
}
