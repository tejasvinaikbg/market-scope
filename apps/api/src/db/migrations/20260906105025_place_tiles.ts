/**
 * Migration: a cache of what the places source answered for one grid cell and one set of categories. Markets in the same
 * city overlap heavily, and the external services are the real ceiling on throughput, so a cell searched once serves every
 * market that covers it until the entry ages out (TILE_CACHE_HOURS).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('place_tiles', (t) => {
    t.increments('id');
    t.text('provider').notNullable(); // 'overpass' | 'google': the same cell answered by a different source is a different entry
    t.text('cell_key').notNullable(); // the grid cell, e.g. '517:3104' — see gridCells in the shared package
    t.text('categories_key').notNullable(); // the category slugs searched, sorted and joined — a different set is a different query
    t.jsonb('places').notNullable(); // the DiscoveredPlace[] the source returned for the whole cell
    t.timestamp('fetched_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['provider', 'cell_key', 'categories_key']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('place_tiles');
}
