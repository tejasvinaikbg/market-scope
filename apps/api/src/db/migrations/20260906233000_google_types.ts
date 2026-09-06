/**
 * Migration: each category's Google Places types beside its OSM selectors — the category → source mapping is data, one
 * column per source. The two mappings differ on purpose: Google's type list has a hypermarket type and OSM has none.
 * Existing rows get their types here; the seed carries the same list for a fresh database.
 */
import type { Knex } from 'knex';

const GOOGLE_TYPES: Record<string, string[]> = {
  supermarket: ['supermarket'],
  pharmacy: ['pharmacy', 'drugstore'],
  hypermarket: ['hypermarket'],
  grocery_store: ['grocery_store'],
  convenience_store: ['convenience_store'],
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (t) => {
    t.jsonb('google_types').notNullable().defaultTo('[]'); // Google place types to search, e.g. ["pharmacy", "drugstore"]
  });
  for (const [slug, types] of Object.entries(GOOGLE_TYPES))
    await knex('categories')
      .where({ slug })
      .update({ google_types: JSON.stringify(types) });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (t) => {
    t.dropColumn('google_types');
  });
}
