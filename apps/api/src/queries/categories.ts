/**
 * All SQL for the categories table.
 */
import { db, type Db } from '../db/knex.ts';

export interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  osmSelectors: Array<{ key: string; value: string }>;
}

export const categoriesQueries = {
  async list(k: Db = db): Promise<CategoryRow[]> {
    const rows = await k('categories').select('id', 'slug', 'name', 'osm_selectors').orderBy('id');
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      osmSelectors: row.osm_selectors,
    }));
  },
};
