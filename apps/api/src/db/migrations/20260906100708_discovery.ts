/**
 * Migration: what discovery needs. The market learns a status, an error and two timestamps; discovered_stores holds what the
 * places source found, one row per store per market, keyed by the source's own id so a re-run updates instead of
 * duplicating; jobs is the in-database queue that runs discovery after the create request has already answered.
 * Everything references markets with ON DELETE CASCADE, so deleting a market later is one statement.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('markets', (t) => {
    t.text('status').notNullable().defaultTo('pending'); // pending → running → ready | partial | failed
    t.text('error'); // what went wrong, in the words the dashboard shows
    t.timestamp('started_at', { useTz: true });
    t.timestamp('completed_at', { useTz: true });
    t.check("status IN ('pending', 'running', 'ready', 'partial', 'failed')", [], 'markets_status_check');
  });

  await knex.schema.createTable('discovered_stores', (t) => {
    t.increments('id');
    t.integer('market_id').notNullable().references('markets.id').onDelete('CASCADE');
    t.text('provider').notNullable(); // which source found it: 'overpass' | 'google'
    t.text('provider_place_id').notNullable(); // the source's own id, e.g. 'node/1464885140'
    t.text('name').notNullable();
    t.integer('category_id').notNullable().references('categories.id');
    t.specificType('location', 'geography(Point, 4326)').notNullable(); // geography: metres for the 150 m match later
    t.text('address'); // often missing in OSM; the list shows name and category
    t.jsonb('tags').notNullable().defaultTo('{}'); // everything the source said
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['market_id', 'provider', 'provider_place_id']); // a re-run updates the row instead of adding one
    t.index('market_id');
  });
  await knex.raw('CREATE INDEX discovered_stores_location_gix ON discovered_stores USING GIST (location)');

  await knex.schema.createTable('jobs', (t) => {
    t.increments('id');
    t.text('type').notNullable(); // 'market.pipeline'
    t.integer('market_id').references('markets.id').onDelete('CASCADE'); // for cleanup; the payload is what the handler reads
    t.jsonb('payload').notNullable().defaultTo('{}');
    t.text('status').notNullable().defaultTo('pending'); // pending → running → done | failed
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('run_after', { useTz: true }).notNullable().defaultTo(knex.fn.now()); // a retry is a pending job with a later run_after
    t.text('last_error');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("status IN ('pending', 'running', 'done', 'failed')", [], 'jobs_status_check');
    t.index(['status', 'run_after']); // what the worker's claim query scans
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('discovered_stores');
  await knex.schema.alterTable('markets', (t) => {
    t.dropChecks(['markets_status_check']);
    t.dropColumns('status', 'error', 'started_at', 'completed_at');
  });
}
