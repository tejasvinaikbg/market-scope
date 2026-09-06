/**
 * What "create the market" kicks off, in order: locate the portfolio's stores that came without coordinates, then discover
 * the stores around them. Each step is idempotent, so a re-run of the whole pipeline is always safe. The market is
 * 'running' from the first step; discovery decides the terminal status.
 */
import { marketsQueries } from '../queries/markets.ts';
import { geocodePortfolio } from './geocode-portfolio.ts';
import { discoverStores } from './discover-stores.ts';

export const MARKET_PIPELINE = 'market.pipeline';

export async function runPipeline(marketId: number): Promise<void> {
  await marketsQueries.setStatus(marketId, 'running');
  await geocodePortfolio(marketId);
  await discoverStores(marketId);
}