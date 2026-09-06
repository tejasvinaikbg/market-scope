/**
 * Migration: a portfolio is one uploaded file; portfolio_stores are its rows, one per store.
 * The store's point is `geography`, not `geometry`: distances in metres come for free (ST_DWithin(a, b, 150)),
 * which the "matched within 150 m" rule needs. The city bbox stayed `geometry` because it is only compared
 * for containment in degrees.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('portfolios', (t) => {
    t.increments('id');
    t.text('name').notNullable();
    t.text('source_filename').notNullable();
    t.integer('row_count').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('portfolio_stores', (t) => {
    t.increments('id');
    t.integer('portfolio_id').notNullable().references('portfolios.id').onDelete('CASCADE'); // delete the file, its rows go too
    t.integer('row_number').notNullable(); // spreadsheet row (header = 1): the number the user sees
    t.text('store_name').notNullable();
    t.text('address').notNullable();
    t.text('city').notNullable();
    t.text('state').notNullable();
    t.text('country').notNullable();
    t.text('category_raw').notNullable(); // exactly what the file said
    t.integer('category_id').references('categories.id'); // resolved when it matches a seeded category, else NULL
    t.specificType('location', 'geography(Point, 4326)'); // NULL until uploaded with coordinates, or geocoded later
    t.text('location_source'); // 'uploaded' | 'geocoded'
    t.unique(['portfolio_id', 'row_number']);
    t.check("location_source IN ('uploaded', 'geocoded')", [], 'portfolio_stores_location_source_check');
    t.check('(location IS NULL) = (location_source IS NULL)', [], 'portfolio_stores_location_pair_check');
    t.index('portfolio_id');
  });
  // The schema builder has no GIST; the spatial index is the one raw statement here.
  await knex.raw('CREATE INDEX portfolio_stores_location_gix ON portfolio_stores USING GIST (location)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portfolio_stores');
  await knex.schema.dropTableIfExists('portfolios');
}
