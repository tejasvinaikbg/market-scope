/**
 * Migration: countries, states, cities. Cities carry columns to cache the geocoder's bounding box.
 */
import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {

  await knex.schema.createTable('countries', (t) => {
    t.increments('id');
    t.text('code').notNullable().unique();
    t.text('name').notNullable();
  });

  await knex.schema.createTable('states', (t) => {
    t.increments('id');
    t.integer('country_id').notNullable().references('countries_id');
    t.text('name').notNullable();
    t.unique(['country_id', 'name']);
  });

  await knex.schema.createTable('cities', (t) => {
    t.increments('id');
    t.integer('state_id').notNullable().references('states_id')
    t.text('name').notNullable()
    t.specificType('bbox', 'geometry(Polygon,4326)')
    t.specificType('centre', 'geometry(Point,4326)')
    t.timestamp('bbox_fetched_at', { useTz: true })
    t.unique(['state_id', 'name'])
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cities')
  await knex.schema.dropTableIfExists('states')
  await knex.schema.dropTableIfExists('countries')
}

