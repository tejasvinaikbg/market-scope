/**
 * Migration: the brief's bonus. A placed portfolio store may be paired with one discovered store — the same shop seen from
 * both sides — with the distance between the two points. The pair lives on the placement row: it is a fact about this
 * store in this market, recomputed by every run. Deleting the discovered store leaves the row and clears the pair.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('market_portfolio_stores', (t) => {
    t.integer('matched_store_id').references('discovered_stores.id').onDelete('SET NULL');
    t.float('match_distance_m');                                         // metres between the two points, on the sphere (a real in Postgres)
    t.timestamp('matched_at', { useTz: true });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('market_portfolio_stores', (t) => {
    t.dropColumns('matched_store_id', 'match_distance_m', 'matched_at');
  });
}