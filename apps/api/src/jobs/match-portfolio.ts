/**
 * The matching step, the brief's bonus: pair every placed portfolio store with the nearest discovered store of the same
 * category within MATCH_DISTANCE_M — the same shop seen from both sides. It is the last thing discovery does before the
 * market reports done, so a dashboard that reads the finished market already sees the pairs. Idempotent: every run clears
 * and recomputes.
 */
import { config } from '../config.ts';
import { matchingQueries } from '../queries/matching.ts';
import { logger } from '../lib/logger.ts';

export async function matchPortfolio(
  marketId: number,
  log: (message: string, meta?: Record<string, unknown>) => void = (m, meta) => logger.info(meta ?? {}, m),
  radiusM: number = config.MATCH_DISTANCE_M,
): Promise<number> {
  const matched = await matchingQueries.matchAll(marketId, radiusM);
  log('portfolio matched', { marketId, matched, radiusM });
  return matched;
}
