/**
 * Migration: where each portfolio store sits for a given market. A portfolio can serve several markets and a store's point
 * is the same in all of them, but inside-or-outside depends on the market's rectangle — so placement is its own table,
 * one row per (market, store), rewritten by every run. Deleting either side removes the row.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('market_portfolio_stores', (t) => {
    t.integer('market_id').notNullable().references('markets.id').onDelete('CASCADE');
    t.integer('portfolio_store_id').notNullable().references('portfolio_stores.id').onDelete('CASCADE');
    t.text('placement').notNullable(); // 'inside' | 'outside' | 'unlocated'
    t.timestamp('placed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['market_id', 'portfolio_store_id']);
    t.check("placement IN ('inside', 'outside', 'unlocated')", [], 'market_portfolio_stores_placement_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('market_portfolio_stores');
}
