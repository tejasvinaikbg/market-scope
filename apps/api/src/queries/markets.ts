/**
 * All SQL for markets and market_categories. The boundary goes in as ST_MakeEnvelope and comes out as its four
 * edges, so the rest of the code only ever sees a Bbox. Connection last (`k`), as in every query file.
 */
import type { Bbox } from '@market-scope/shared';
import { db, type Db } from '../db/knex.ts';

export type PlacesProvider = 'overpass' | 'google';
export type GeocoderProvider = 'nominatim' | 'google';

export interface MarketRow {
  id: number; name: string;
  portfolioId: number; portfolioName: string;
  cityId: number; cityName: string;
  boundary: Bbox; areaSqKm: number;
  placesProvider: PlacesProvider; geocoderProvider: GeocoderProvider;
  categories: Array<{ id: number; slug: string; name: string }>;
  createdAt: Date;
}

// One SELECT for byId and list: the four edges, the joined names, the categories as one JSON array (ordered by id, like the seed).
const SELECT_MARKET = `
  SELECT m.id, m.name, m.portfolio_id, p.name AS portfolio_name, m.city_id, c.name AS city_name,
         ST_YMin(m.boundary) AS south, ST_XMin(m.boundary) AS west, ST_YMax(m.boundary) AS north, ST_XMax(m.boundary) AS east,
         m.area_sq_km, m.places_provider, m.geocoder_provider, m.created_at,
         COALESCE((SELECT json_agg(json_build_object('id', cat.id, 'slug', cat.slug, 'name', cat.name) ORDER BY cat.id)
                     FROM market_categories mc JOIN categories cat ON cat.id = mc.category_id WHERE mc.market_id = m.id), '[]') AS categories
    FROM markets m
    JOIN portfolios p ON p.id = m.portfolio_id
    JOIN cities c ON c.id = m.city_id`;

// A raw pg row → the typed shape. The one place that knows this query's column names.
const toMarket = (r: Record<string, any>): MarketRow => ({
  id: r.id, name: r.name, portfolioId: r.portfolio_id, portfolioName: r.portfolio_name, cityId: r.city_id, cityName: r.city_name,
  boundary: { south: r.south, west: r.west, north: r.north, east: r.east }, areaSqKm: Number(r.area_sq_km),
  placesProvider: r.places_provider, geocoderProvider: r.geocoder_provider, categories: r.categories, createdAt: r.created_at,
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
};