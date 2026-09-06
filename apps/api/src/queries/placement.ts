/**
 * All SQL for market_portfolio_stores. One statement places every store of the market's portfolio: PostGIS answers
 * "is this point covered by this rectangle?" for all of them at once, and a store without a point is recorded as
 * unlocated rather than skipped, so the counts always add up to the portfolio.
 */
import { db, type Db } from '../db/knex.ts';

export type Placement = 'inside' | 'outside' | 'unlocated';
export interface PlacementCounts { inside: number; outside: number; unlocated: number }

export const placementQueries = {
  /** Place (or re-place) every store of the market's portfolio. ST_Covers includes points exactly on the edge. */
  async placeAll(marketId: number, k: Db = db): Promise<void> {
    await k.raw(`
      INSERT INTO market_portfolio_stores (market_id, portfolio_store_id, placement, placed_at)
      SELECT m.id, s.id,
             CASE WHEN s.location IS NULL THEN 'unlocated'
                  WHEN ST_Covers(m.boundary, s.location::geometry) THEN 'inside'
                  ELSE 'outside' END,
             now()
        FROM markets m JOIN portfolio_stores s ON s.portfolio_id = m.portfolio_id
       WHERE m.id = ?
      ON CONFLICT (market_id, portfolio_store_id) DO UPDATE SET placement = EXCLUDED.placement, placed_at = EXCLUDED.placed_at`, [marketId]);
  },

  async counts(marketId: number, k: Db = db): Promise<PlacementCounts> {
    const rows = await k('market_portfolio_stores').where({ market_id: marketId }).select('placement').count('* as n').groupBy('placement');
    const by = Object.fromEntries(rows.map((r) => [r.placement, Number(r.n)]));
    return { inside: by.inside ?? 0, outside: by.outside ?? 0, unlocated: by.unlocated ?? 0 };
  },
};