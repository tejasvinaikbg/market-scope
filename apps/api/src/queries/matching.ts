/**
 * All SQL for matching: for every placed portfolio store, the nearest discovered store of the same category within the
 * radius — the same shop seen from both sides. One set-based statement; PostGIS measures metres on the sphere. A run first
 * clears every pair of the market, so a store that moved or a boundary that shrank can never leave a stale pair behind.
 */
import { db, type Db } from '../db/knex.ts';

export const matchingQueries = {
  /**
   * Clear and recompute every pair of the market; returns how many stores found a partner. Same category only, because
   * a pharmacy 80 m from a supermarket is not that supermarket; a store whose category matched nothing seeded has no
   * category to insist on and takes the nearest of any kind.
   */
  async matchAll(marketId: number, radiusM: number, k: Db = db): Promise<number> {
    await k('market_portfolio_stores').where({ market_id: marketId }).update({ matched_store_id: null, match_distance_m: null, matched_at: null });
    const { rowCount } = await k.raw(`
      UPDATE market_portfolio_stores p
         SET matched_store_id = near.id, match_distance_m = near.distance_m, matched_at = now()
        FROM portfolio_stores s
       CROSS JOIN LATERAL (
             SELECT d.id, ST_Distance(d.location, s.location) AS distance_m
               FROM discovered_stores d
              WHERE d.market_id = :marketId
                AND ST_DWithin(d.location, s.location, :radius)
                AND (s.category_id IS NULL OR d.category_id = s.category_id)
              ORDER BY d.location <-> s.location
              LIMIT 1) near
       WHERE p.market_id = :marketId AND s.id = p.portfolio_store_id AND s.location IS NOT NULL`, { marketId, radius: radiusM });
    return rowCount ?? 0;
  },

  async count(marketId: number, k: Db = db): Promise<number> {
    const row = await k('market_portfolio_stores').where({ market_id: marketId }).whereNotNull('matched_store_id').count('* as n').first();
    return Number(row?.n ?? 0);
  },
};
