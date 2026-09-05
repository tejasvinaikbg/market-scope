/**
 * Seed: India → three states → three cities for the dropdowns. Safe to re-run (onConflict ignore).
 */
import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('categories').insert([
    { slug: 'supermarket', name: 'Supermarket', osm_selectors: JSON.stringify([{ key: 'shop', value: 'supermarket' }]) },
    { slug: 'pharmacy', name: 'Pharmacy', osm_selectors: JSON.stringify([{ key: 'amenity', value: 'pharmacy' }, { key: 'shop', value: 'chemist' }]) },
    // OSM has no hypermarket tag; Indian hypermarkets are mostly tagged shop=supermarket. Best-effort mapping, disclosed in the README.
    { slug: 'hypermarket', name: 'Hypermarket', osm_selectors: JSON.stringify([{ key: 'shop', value: 'department_store' }, { key: 'shop', value: 'wholesale' }]) },
    { slug: 'grocery_store', name: 'Grocery Store', osm_selectors: JSON.stringify([{ key: 'shop', value: 'grocery' }, { key: 'shop', value: 'greengrocer' }]) },
    { slug: 'convenience_store', name: 'Convenience Store', osm_selectors: JSON.stringify([{ key: 'shop', value: 'convenience' }, { key: 'shop', value: 'general' }]) },
  ]).onConflict('slug').ignore();
}