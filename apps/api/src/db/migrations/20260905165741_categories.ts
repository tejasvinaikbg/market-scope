/**
 * Migration: store categories with their OSM tag selectors as JSONB (the category → OSM mapping is data).
 */
import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (t) => {
    t.increments('id')
    t.text('slug').notNullable().unique()
    t.text('name').notNullable()
    t.jsonb('osm_selectors').notNullable()
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('categories')
}

