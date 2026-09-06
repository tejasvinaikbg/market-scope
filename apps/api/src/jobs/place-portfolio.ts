/**
 * The placement step: after geocoding, decide for every portfolio store whether it sits inside the market's rectangle,
 * outside it, or has no point to judge by. One set-based statement; PostGIS does the geometry. Idempotent: a re-run
 * rewrites every row, so a store located since the last run moves from unlocated to its side.
 */
import { placementQueries, type PlacementCounts } from '../queries/placement.ts';
import { logger } from '../lib/logger.ts';

export async function placePortfolio(
  marketId: number,
  log: (message: string, meta?: Record<string, unknown>) => void = (m, meta) => logger.info(meta ?? {}, m),
): Promise<PlacementCounts> {
  await placementQueries.placeAll(marketId);
  const counts = await placementQueries.counts(marketId);
  log('portfolio placed', { marketId, ...counts });
  return counts;
}
