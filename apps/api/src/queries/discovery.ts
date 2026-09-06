/**
 * All SQL for discovered_stores. One upsert statement for any number of places: the source's own id is the conflict key,
 * so running discovery again updates what it already had instead of duplicating it.
 */
import type { Knex } from 'knex';
import { db, type Db } from '../db/knex.ts';
import type { DiscoveredPlace } from '../providers/places.ts';

export const discoveryQueries = {
  /** Everything found for the market, gone: what an edited boundary or category set makes stale. Pairs go with it (ON DELETE SET NULL). */
  async clearForMarket(marketId: number, k: Db = db): Promise<void> {
    await k('discovered_stores').where({ market_id: marketId }).del();
  },

  /** Insert or update every place in one statement (UNNEST, like the portfolio import). tags travel as JSON text and are cast on the way in. */
  async upsertStores(marketId: number, provider: string, places: DiscoveredPlace[], k: Db = db): Promise<void> {
    if (places.length === 0) return;
    const column = <K extends keyof DiscoveredPlace>(key: K) => places.map((p) => p[key]);
    await k.raw(
      `INSERT INTO discovered_stores (market_id, provider, provider_place_id, name, category_id, location, address, tags)
       SELECT ?, ?, t.place_id, t.name, t.category_id, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography, t.address, t.tags::jsonb
         FROM UNNEST(?::text[], ?::text[], ?::int[], ?::float8[], ?::float8[], ?::text[], ?::text[])
              AS t(place_id, name, category_id, lat, lng, address, tags)
       ON CONFLICT (market_id, provider, provider_place_id) DO UPDATE
         SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, location = EXCLUDED.location,
             address = EXCLUDED.address, tags = EXCLUDED.tags, updated_at = now()`,
      [
        marketId,
        provider,
        column('providerPlaceId'),
        column('name'),
        column('categoryId'),
        column('lat'),
        column('lng'),
        column('address'),
        places.map((p) => JSON.stringify(p.tags)),
      ] as unknown as Knex.RawBinding[],
    );
  },

  /** A cell's places from an earlier run — any market's — if fetched within maxAgeHours; null when there is none or it is too old. */
  async cachedTile(provider: string, cellKey: string, categoriesKey: string, maxAgeHours: number, k: Db = db): Promise<DiscoveredPlace[] | null> {
    if (maxAgeHours <= 0) return null;
    const r = await k('place_tiles')
      .where({ provider, cell_key: cellKey, categories_key: categoriesKey })
      .andWhere('fetched_at', '>', k.raw(`now() - (? * interval '1 hour')`, [maxAgeHours]))
      .first('places');
    return r ? (r.places as DiscoveredPlace[]) : null;
  },

  /** Remember what the source answered for a cell, replacing an older answer. */
  async cacheTile(provider: string, cellKey: string, categoriesKey: string, places: DiscoveredPlace[], k: Db = db): Promise<void> {
    await k('place_tiles')
      .insert({ provider, cell_key: cellKey, categories_key: categoriesKey, places: JSON.stringify(places), fetched_at: k.fn.now() })
      .onConflict(['provider', 'cell_key', 'categories_key'])
      .merge();
  },

  async countForMarket(marketId: number, k: Db = db): Promise<number> {
    const r = await k('discovered_stores').where({ market_id: marketId }).count('* as n').first();
    return Number(r?.n ?? 0);
  },
};
