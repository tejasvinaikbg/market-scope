/**
 * All SQL for portfolios and portfolio_stores. Every function takes the connection last (`k`), so the
 * service can pass a transaction and tests can pass the plain db.
 */
import type { Knex } from 'knex';
import type { Bbox, LatLng, PortfolioRowInput } from '@market-scope/shared';
import { db, type Db } from '../db/knex.ts';

export interface PortfolioRow {
  id: number;
  name: string;
  sourceFilename: string;
  rowCount: number;
  createdAt: Date;
}
export interface PortfolioSummary extends PortfolioRow {
  withCoords: number;
  withoutCoords: number;
  bounds: Bbox | null;
}

// The one place that knows this table's snake_case → camelCase.
const toPortfolio = (r: Record<string, unknown>): PortfolioRow => ({
  id: r.id as number,
  name: r.name as string,
  sourceFilename: r.source_filename as string,
  rowCount: r.row_count as number,
  createdAt: r.created_at as Date,
});

export const portfoliosQueries = {
  async insert(p: { name: string; sourceFilename: string; rowCount: number }, k: Db = db): Promise<PortfolioRow> {
    const [row] = await k('portfolios').insert({ name: p.name, source_filename: p.sourceFilename, row_count: p.rowCount }).returning('*');
    return toPortfolio(row);
  },

  /**
   * Bulk insert in ONE statement, whatever the row count: each column is sent as an array and UNNEST turns the
   * arrays back into rows inside Postgres. The category is resolved in SQL by case-insensitive name or by slug;
   * an unknown category stays NULL — it is data, not an error. Raw SQL because the query builder has no UNNEST.
   */
  async insertStores(portfolioId: number, rows: PortfolioRowInput[], k: Db = db): Promise<void> {
    if (rows.length === 0) return;
    const column = <K extends keyof PortfolioRowInput>(key: K) => rows.map((r) => r[key]);
    await k.raw(
      `INSERT INTO portfolio_stores
         (portfolio_id, row_number, store_name, address, city, state, country, category_raw, category_id, location, location_source)
       SELECT ?, t.row_number, t.store_name, t.address, t.city, t.state, t.country, t.category, c.id,
              CASE WHEN t.lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography END,
              CASE WHEN t.lat IS NULL THEN NULL ELSE 'uploaded' END
         FROM UNNEST(?::int[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::float8[], ?::float8[])
              AS t(row_number, store_name, address, city, state, country, category, lat, lng)
         LEFT JOIN categories c ON lower(c.name) = lower(t.category) OR c.slug = lower(replace(t.category, ' ', '_'))`,
      // The pg driver serialises a JS array as a Postgres array; the ::type[] casts above tell Postgres what each one is.
      [
        portfolioId,
        column('rowNumber'),
        column('storeName'),
        column('address'),
        column('city'),
        column('state'),
        column('country'),
        column('category'),
        column('latitude'),
        column('longitude'),
      ] as unknown as Knex.RawBinding[],
    );
  },

  /** The portfolio with the counts the stepper shows and the extent of its located stores (ST_Extent: one box around them all). */
  async summary(id: number, k: Db = db): Promise<PortfolioSummary | null> {
    const r = await k('portfolios as p')
      .leftJoin('portfolio_stores as s', 's.portfolio_id', 'p.id')
      .where('p.id', id)
      .groupBy('p.id')
      .select(
        'p.*',
        k.raw('COUNT(s.location)::int AS with_coords'),
        k.raw('COUNT(s.id) FILTER (WHERE s.location IS NULL)::int AS without_coords'),
        k.raw('ST_YMin(ST_Extent(s.location::geometry)) AS south, ST_XMin(ST_Extent(s.location::geometry)) AS west'),
        k.raw('ST_YMax(ST_Extent(s.location::geometry)) AS north, ST_XMax(ST_Extent(s.location::geometry)) AS east'),
      )
      .first();
    if (!r) return null;
    const bounds = r.south == null ? null : { south: r.south, west: r.west, north: r.north, east: r.east }; // no located store → NULLs
    return { ...toPortfolio(r), withCoords: r.with_coords, withoutCoords: r.without_coords, bounds };
  },

  async list(k: Db = db): Promise<PortfolioRow[]> {
    return (await k('portfolios').orderBy('created_at', 'desc')).map(toPortfolio);
  },

  /** The stores still without a point, with what the geocoder needs to find them. Row order, so a re-run is predictable. */
  async storesToGeocode(portfolioId: number, k: Db = db): Promise<Array<{ id: number; address: string; city: string; state: string; country: string }>> {
    return k('portfolio_stores')
      .select('id', 'address', 'city', 'state', 'country')
      .where({ portfolio_id: portfolioId })
      .whereNull('location')
      .orderBy('row_number');
  },

  /** A found address: the point, marked as geocoded (the CHECK from Phase 2 ties location and location_source together). */
  async setGeocoded(id: number, point: LatLng, k: Db = db): Promise<void> {
    await k('portfolio_stores')
      .where({ id })
      .update({
        location: k.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [point.lng, point.lat]), // x = lng, y = lat
        location_source: 'geocoded',
        geocode_status: 'ok',
        geocoded_at: k.fn.now(),
      });
  },

  /** An address that was not found, or a failure after retries. The store stays unplaced; the dashboard can say why. */
  async setGeocodeStatus(id: number, status: 'not_found' | 'error', k: Db = db): Promise<void> {
    await k('portfolio_stores').where({ id }).update({ geocode_status: status, geocoded_at: k.fn.now() });
  },
};
