/**
 * Seed: the five store categories with their search terms per source — OSM tag selectors and Google place types. Safe to
 * re-run (onConflict ignore).
 */
import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('categories')
    .insert([
      {
        slug: 'supermarket',
        name: 'Supermarket',
        osm_selectors: JSON.stringify([{ key: 'shop', value: 'supermarket' }]),
        google_types: JSON.stringify(['supermarket']),
      },
      {
        slug: 'pharmacy',
        name: 'Pharmacy',
        osm_selectors: JSON.stringify([
          { key: 'amenity', value: 'pharmacy' },
          { key: 'shop', value: 'chemist' },
        ]),
        google_types: JSON.stringify(['pharmacy', 'drugstore']),
      },
      // OSM has no hypermarket tag; Indian hypermarkets are mostly tagged shop=supermarket. Best-effort mapping, disclosed in the README. Google has the type.
      {
        slug: 'hypermarket',
        name: 'Hypermarket',
        osm_selectors: JSON.stringify([
          { key: 'shop', value: 'department_store' },
          { key: 'shop', value: 'wholesale' },
        ]),
        google_types: JSON.stringify(['hypermarket']),
      },
      {
        slug: 'grocery_store',
        name: 'Grocery Store',
        osm_selectors: JSON.stringify([
          { key: 'shop', value: 'grocery' },
          { key: 'shop', value: 'greengrocer' },
        ]),
        google_types: JSON.stringify(['grocery_store']),
      },
      {
        slug: 'convenience_store',
        name: 'Convenience Store',
        osm_selectors: JSON.stringify([
          { key: 'shop', value: 'convenience' },
          { key: 'shop', value: 'general' },
        ]),
        google_types: JSON.stringify(['convenience_store']),
      },
    ])
    .onConflict('slug')
    .ignore();
}
