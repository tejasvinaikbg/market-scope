/**
 * All SQL for discovered_stores. One upsert statement for any number of places: the source's own id is the conflict key,
 * so running discovery again updates what it already had instead of duplicating it.
 */
import type { Knex } from 'knex';
import { db, type Db } from '../db/knex.ts';
import type { DiscoveredPlace } from '../providers/places.ts';

export const discoveryQueries = {
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
      [marketId, provider, column('providerPlaceId'), column('name'), column('categoryId'), column('lat'), column('lng'),
       column('address'), places.map((p) => JSON.stringify(p.tags))] as unknown as Knex.RawBinding[],
    );
  },

  async countForMarket(marketId: number, k: Db = db): Promise<number> {
    const r = await k('discovered_stores').where({ market_id: marketId }).count('* as n').first();
    return Number(r?.n ?? 0);
  },
};
