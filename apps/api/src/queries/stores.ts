/**
 * All SQL for "what does this market's dashboard draw": the discovered stores and the portfolio's stores with their
 * placement and, where one was found, the discovered store each of them is, as one list of the same shape, filtered in the
 * database by layer, category and name. Totals per layer are
 * counted separately and never filtered, because the stat cells show the whole market while the list shows the selection.
 */
import type { Knex } from 'knex';
import { db, type Db } from '../db/knex.ts';

export type StoreLayer = 'discovered' | 'portfolio_inside' | 'portfolio_outside';
export interface StoreRow {
  id: string;                          // 'd:<discovered id>' or 'p:<portfolio store id>' — one list, two tables
  layer: StoreLayer;
  name: string;
  category: { id: number; slug: string; name: string } | null;   // null for a portfolio store whose category matched nothing seeded
  lat: number;
  lng: number;
  address: string | null;
  source: string;                      // 'overpass' | 'google' | 'uploaded' | 'geocoded'
  match: { id: string; name: string; distanceM: number } | null;   // the discovered store this portfolio store is, when one was found
}
export type LayerFilter = StoreLayer | 'matched';   // 'matched' is not a layer of its own: it is the portfolio rows that found a partner
export interface UnlocatedRow { id: string; name: string; category: StoreRow['category']; address: string | null; reason: string | null }
export interface StoreFilters { layers?: LayerFilter[]; categories?: string[]; q?: string }
export interface StoreCounts { discovered: number; portfolioInside: number; portfolioOutside: number; portfolioUnlocated: number; matched: number }

// Both tables as the same columns; the UNION is what lets one WHERE and one ORDER BY serve the list.
const STORES = `
  SELECT 'd:' || d.id AS id, 'discovered' AS layer, d.name, c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
         ST_Y(d.location::geometry) AS lat, ST_X(d.location::geometry) AS lng, d.address, d.provider AS source,
         NULL::text AS match_id, NULL::text AS match_name, NULL::real AS match_distance_m
    FROM discovered_stores d JOIN categories c ON c.id = d.category_id
   WHERE d.market_id = :marketId
  UNION ALL
  SELECT 'p:' || s.id, 'portfolio_' || p.placement, s.store_name, c.id, c.slug, c.name,
         ST_Y(s.location::geometry), ST_X(s.location::geometry), s.address, s.location_source,
         'd:' || md.id, md.name, p.match_distance_m
    FROM market_portfolio_stores p
    JOIN portfolio_stores s ON s.id = p.portfolio_store_id
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN discovered_stores md ON md.id = p.matched_store_id
   WHERE p.market_id = :marketId AND p.placement IN ('inside', 'outside')`;

const toStore = (r: Record<string, any>): StoreRow => ({
  id: r.id, layer: r.layer, name: r.name,
  category: r.category_id == null ? null : { id: r.category_id, slug: r.category_slug, name: r.category_name },
  lat: r.lat, lng: r.lng, address: r.address, source: r.source,
  match: r.match_id == null ? null : { id: r.match_id, name: r.match_name, distanceM: Math.round(r.match_distance_m) },
});

export const storesQueries = {
  /** The list the map and the table show, filtered in SQL. An empty filter means everything. */
  async list(marketId: number, f: StoreFilters = {}, k: Db = db): Promise<StoreRow[]> {
    const where: string[] = [];
    const bindings: Record<string, Knex.RawBinding> = { marketId };
    if (f.layers?.length) {
      // 'matched' cuts across the layers: it is asked for beside them, never instead of them.
      const layers = f.layers.filter((l) => l !== 'matched');
      const parts: string[] = [];
      if (layers.length) { parts.push('t.layer = ANY(:layers)'); bindings.layers = layers; }
      if (f.layers.includes('matched')) parts.push('t.match_id IS NOT NULL');
      where.push(`(${parts.join(' OR ')})`);
    }
    if (f.categories?.length) { where.push('t.category_slug = ANY(:categories)'); bindings.categories = f.categories; }
    if (f.q?.trim()) { where.push('t.name ILIKE :q'); bindings.q = `%${f.q.trim()}%`; }
    const { rows } = await k.raw(
      `SELECT * FROM (${STORES}) t ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.layer, t.name`, bindings);
    return rows.map(toStore);
  },

  /** Portfolio stores with no point: on the list, not on the map, with the reason the geocoder gave. */
  async unlocated(marketId: number, k: Db = db): Promise<UnlocatedRow[]> {
    const rows = await k('market_portfolio_stores as p').join('portfolio_stores as s', 's.id', 'p.portfolio_store_id')
      .leftJoin('categories as c', 'c.id', 's.category_id')
      .where({ 'p.market_id': marketId, 'p.placement': 'unlocated' })
      .select('s.id', 's.store_name', 's.address', 's.geocode_status', 'c.id as category_id', 'c.slug as category_slug', 'c.name as category_name')
      .orderBy('s.store_name');
    return rows.map((r) => ({
      id: `p:${r.id}`, name: r.store_name, address: r.address, reason: r.geocode_status,
      category: r.category_id == null ? null : { id: r.category_id, slug: r.category_slug, name: r.category_name }
    }));
  },

  /** Totals per layer for the whole market — the stat cells — regardless of any filter. */
  async counts(marketId: number, k: Db = db): Promise<StoreCounts> {
    const { rows } = await k.raw(`
      SELECT (SELECT COUNT(*) FROM discovered_stores WHERE market_id = :id)::int AS discovered,
             (SELECT COUNT(*) FROM market_portfolio_stores WHERE market_id = :id AND placement = 'inside')::int AS inside,
             (SELECT COUNT(*) FROM market_portfolio_stores WHERE market_id = :id AND placement = 'outside')::int AS outside,
             (SELECT COUNT(*) FROM market_portfolio_stores WHERE market_id = :id AND placement = 'unlocated')::int AS unlocated,
             (SELECT COUNT(*) FROM market_portfolio_stores WHERE market_id = :id AND matched_store_id IS NOT NULL)::int AS matched`, { id: marketId });
    const r = rows[0];
    return { discovered: r.discovered, portfolioInside: r.inside, portfolioOutside: r.outside, portfolioUnlocated: r.unlocated, matched: r.matched };
  },
};