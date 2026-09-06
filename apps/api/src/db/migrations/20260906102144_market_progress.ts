/**
 * Migration: discovery reports how far it has got. `progress` is { tiles, done, failed } while a run is in flight and after it,
 * so the dashboard can say "3 of 4 areas searched" instead of only "running".
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('markets', (t) => {
    t.jsonb('progress'); // null until discovery starts
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('markets', (t) => {
    t.dropColumn('progress');
  });
}
