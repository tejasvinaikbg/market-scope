/**
 * What "create the market" kicks off, in order. Today: discovery. Geocoding the portfolio and placing its stores join
 * this list as they are built, each an idempotent step so a re-run of the whole pipeline is always safe.
 */
import { discoverStores } from './discover-stores.ts';

export const MARKET_PIPELINE = 'market.pipeline';

export async function runPipeline(marketId: number): Promise<void> {
  await discoverStores(marketId);
}
