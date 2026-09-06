/**
 * All SQL for portfolios and portfolio_stores. Every function takes the connection last (`k`), so the
 * service can pass a transaction and tests can pass the plain db.
 */
import type { Knex } from 'knex';
import type { PortfolioRowInput } from '@market-scope/shared';
import { db, type Db } from '../db/knex.ts';

export interface PortfolioRow { id: number; name: string; sourceFilename: string; rowCount: number; createdAt: Date }
export interface PortfolioSummary extends PortfolioRow { withCoords: number; withoutCoords: number }

// The one place that knows this table's snake_case → camelCase.
const toPortfolio = (r: Record<string, unknown>): PortfolioRow => ({
  id: r.id as number, name: r.name as string, sourceFilename: r.source_filename as string, rowCount: r.row_count as number, createdAt: r.created_at as Date,
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
      [portfolioId, column('rowNumber'), column('storeName'), column('address'), column('city'), column('state'), column('country'),
        column('category'), column('latitude'), column('longitude')] as unknown as Knex.RawBinding[],
    );
  },

  /** The portfolio with the two counts the stepper and the dashboard show. COUNT(s.location) counts only non-NULL points. */
  async summary(id: number, k: Db = db): Promise<PortfolioSummary | null> {
    const r = await k('portfolios as p')
      .leftJoin('portfolio_stores as s', 's.portfolio_id', 'p.id')
      .where('p.id', id)
      .groupBy('p.id')
      .select('p.*', k.raw('COUNT(s.location)::int AS with_coords'), k.raw('COUNT(s.id) FILTER (WHERE s.location IS NULL)::int AS without_coords'))
      .first();
    return r ? { ...toPortfolio(r), withCoords: r.with_coords, withoutCoords: r.without_coords } : null;
  },

  async list(k: Db = db): Promise<PortfolioRow[]> {
    return (await k('portfolios').orderBy('created_at', 'desc')).map(toPortfolio);
  },
};