/**
 * Migration: a market is a portfolio, a city, a rectangle, a set of categories and two data-source choices.
 * The boundary is a PostGIS polygon so containment and area work on it directly. area_sq_km is stored from
 * PostGIS at creation — the server's own measurement, never the client's number.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('markets', (t) => {
    t.increments('id');
    t.text('name').notNullable();
    t.integer('portfolio_id').notNullable().references('portfolios.id');
    t.integer('city_id').notNullable().references('cities.id');
    t.specificType('boundary', 'geometry(Polygon, 4326)').notNullable();   // the rectangle the user left
    t.decimal('area_sq_km', 10, 4).notNullable();                           // ST_Area(boundary::geography) / 1e6
    t.text('places_provider').notNullable();                                // where discovery will look
    t.text('geocoder_provider').notNullable();                              // who places addresses without coordinates
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("places_provider IN ('overpass', 'google')", [], 'markets_places_provider_check');
    t.check("geocoder_provider IN ('nominatim', 'google')", [], 'markets_geocoder_provider_check');
  });
  await knex.raw('CREATE INDEX markets_boundary_gix ON markets USING GIST (boundary)');   // the schema builder has no GIST

  await knex.schema.createTable('market_categories', (t) => {
    t.integer('market_id').notNullable().references('markets.id').onDelete('CASCADE');   // delete the market, its rows go too
    t.integer('category_id').notNullable().references('categories.id');
    t.primary(['market_id', 'category_id']);                                             // a category once per market
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('market_categories');
  await knex.schema.dropTableIfExists('markets');
}