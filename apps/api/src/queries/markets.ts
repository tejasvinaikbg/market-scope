/**
 * All SQL for markets and market_categories. The boundary goes in as ST_MakeEnvelope and comes out as its four
 * edges, so the rest of the code only ever sees a Bbox. Connection last (`k`), as in every query file.
 */
import type { Bbox } from '@market-scope/shared';
import { db, type Db } from '../db/knex.ts';
import type { CategorySearch } from '../providers/places.ts';

export type PlacesProvider = 'overpass' | 'google';
export type GeocoderProvider = 'nominatim' | 'google';
export type MarketStatus = 'pending' | 'running' | 'ready' | 'partial' | 'failed';
/** How far discovery has got: areas (tiles) to search, searched, and searched without success. */
export interface MarketProgress { tiles: number; done: number; failed: number }

export interface MarketRow {
  id: number; name: string;
  portfolioId: number; portfolioName: string;
  cityId: number; cityName: string;
  boundary: Bbox; areaSqKm: number;
  placesProvider: PlacesProvider; geocoderProvider: GeocoderProvider;
  categories: Array<{ id: number; slug: string; name: string }>;
  status: MarketStatus; error: string | null; startedAt: Date | null; completedAt: Date | null;
  progress: MarketProgress | null;                      // null until discovery starts
  geocoding: { total: number; done: number; failed: number };   // the portfolio's stores that needed locating, and how it went
  storeCount: number;                                   // discovered so far; grows while discovery runs
  createdAt: Date;
}

// One SELECT for byId and list: the four edges, the joined names, the categories as one JSON array (ordered by id, like the seed).
const SELECT_MARKET = `
  SELECT m.id, m.name, m.portfolio_id, p.name AS portfolio_name, m.city_id, c.name AS city_name,
         ST_YMin(m.boundary) AS south, ST_XMin(m.boundary) AS west, ST_YMax(m.boundary) AS north, ST_XMax(m.boundary) AS east,
         m.area_sq_km, m.places_provider, m.geocoder_provider, m.created_at,
         m.status, m.error, m.started_at, m.completed_at, m.progress,
         (SELECT COUNT(*) FROM discovered_stores d WHERE d.market_id = m.id)::int AS store_count,
         (SELECT COUNT(*) FROM portfolio_stores s WHERE s.portfolio_id = m.portfolio_id AND s.location_source IS DISTINCT FROM 'uploaded')::int AS geo_total,
         (SELECT COUNT(*) FROM portfolio_stores s WHERE s.portfolio_id = m.portfolio_id AND s.location_source = 'geocoded')::int AS geo_done,
         (SELECT COUNT(*) FROM portfolio_stores s WHERE s.portfolio_id = m.portfolio_id AND s.location IS NULL AND s.geocode_status IS NOT NULL)::int AS geo_failed,
         COALESCE((SELECT json_agg(json_build_object('id', cat.id, 'slug', cat.slug, 'name', cat.name) ORDER BY cat.id)
                     FROM market_categories mc JOIN categories cat ON cat.id = mc.category_id WHERE mc.market_id = m.id), '[]') AS categories
    FROM markets m
    JOIN portfolios p ON p.id = m.portfolio_id
    JOIN cities c ON c.id = m.city_id`;

// A raw pg row → the typed shape. The one place that knows this query's column names.
const toMarket = (r: Record<string, any>): MarketRow => ({
  id: r.id, name: r.name, portfolioId: r.portfolio_id, portfolioName: r.portfolio_name, cityId: r.city_id, cityName: r.city_name,
  boundary: { south: r.south, west: r.west, north: r.north, east: r.east }, areaSqKm: Number(r.area_sq_km),
  placesProvider: r.places_provider, geocoderProvider: r.geocoder_provider, categories: r.categories,
  status: r.status, error: r.error, startedAt: r.started_at, completedAt: r.completed_at, progress: r.progress, storeCount: r.store_count,
  geocoding: { total: r.geo_total, done: r.geo_done, failed: r.geo_failed }, createdAt: r.created_at,
});

export interface NewMarket {
  name: string; portfolioId: number; cityId: number; boundary: Bbox; areaSqKm: number;
  placesProvider: PlacesProvider; geocoderProvider: GeocoderProvider; categoryIds: number[];
}

export const marketsQueries = {
  /** PostGIS measures the rectangle on the spheroid. This is the number that is stored and enforced. */
  async areaSqKm(b: Bbox, k: Db = db): Promise<number> {
    const { rows } = await k.raw('SELECT ST_Area(ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography) / 1e6 AS area', [b.west, b.south, b.east, b.north]);
    return Number(rows[0].area);
  },

  /** The market row and its category rows; the caller wraps this in a transaction. */
  async insert(m: NewMarket, k: Db): Promise<number> {
    const b = m.boundary;
    const [row] = await k('markets').insert({
      name: m.name, portfolio_id: m.portfolioId, city_id: m.cityId, area_sq_km: m.areaSqKm,
      places_provider: m.placesProvider, geocoder_provider: m.geocoderProvider,
      boundary: k.raw('ST_MakeEnvelope(?, ?, ?, ?, 4326)', [b.west, b.south, b.east, b.north]),
    }).returning('id');
    await k('market_categories').insert(m.categoryIds.map((category_id) => ({ market_id: row.id, category_id })));
    return row.id;
  },

  async byId(id: number, k: Db = db): Promise<MarketRow | null> {
    const { rows } = await k.raw(`${SELECT_MARKET} WHERE m.id = ?`, [id]);
    return rows[0] ? toMarket(rows[0]) : null;
  },

  async list(k: Db = db): Promise<MarketRow[]> {
    const { rows } = await k.raw(`${SELECT_MARKET} ORDER BY m.created_at DESC`);
    return rows.map(toMarket);
  },

  /** The market's categories with their OSM search terms — what the places provider is asked for. */
  async categorySearches(marketId: number, k: Db = db): Promise<CategorySearch[]> {
    const rows = await k('market_categories as mc').join('categories as c', 'c.id', 'mc.category_id')
      .where('mc.market_id', marketId).orderBy('c.id').select('c.id', 'c.slug', 'c.osm_selectors');
    return rows.map((r) => ({ categoryId: r.id, slug: r.slug, selectors: r.osm_selectors }));
  },

  async setProgress(id: number, progress: MarketProgress, k: Db = db): Promise<void> {
    await k('markets').where({ id }).update({ progress: JSON.stringify(progress) });
  },

  /** Status transitions stamp their own timestamps: running sets started_at, any terminal state sets completed_at. */
  async setStatus(id: number, status: MarketStatus, error: string | null = null, k: Db = db): Promise<void> {
    await k('markets').where({ id }).update({
      status, error,
      started_at: k.raw(`CASE WHEN ? = 'running' THEN now() ELSE started_at END`, [status]),
      completed_at: k.raw(`CASE WHEN ? IN ('ready', 'partial', 'failed') THEN now() ELSE completed_at END`, [status]),
    });
  },
};