/**
 * Migration: geocoding leaves a record on every portfolio store it touched. `geocode_status` says how the last attempt
 * ended and `geocoded_at` when; a store that was uploaded with coordinates never gets either. Together with
 * location_source ('uploaded' | 'geocoded', from Phase 2) the dashboard can say "located from its address" or "not found".
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('portfolio_stores', (t) => {
    t.text('geocode_status');                                         // 'ok' | 'not_found' | 'error'; NULL if never attempted
    t.timestamp('geocoded_at', { useTz: true });
    t.check("geocode_status IN ('ok', 'not_found', 'error')", [], 'portfolio_stores_geocode_status_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('portfolio_stores', (t) => {
    t.dropChecks(['portfolio_stores_geocode_status_check']);
    t.dropColumns('geocode_status', 'geocoded_at');
  });
}