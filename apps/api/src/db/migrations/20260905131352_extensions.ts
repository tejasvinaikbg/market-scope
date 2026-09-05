/**
 * Migration: enable PostGIS (spatial types and ST_* functions) and pgcrypto (gen_random_uuid).
 */
import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto;')
}


export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP EXTENSION IF EXISTS pgcrypto; DROP EXTENSION IF EXISTS postgis CASCADE')
}

