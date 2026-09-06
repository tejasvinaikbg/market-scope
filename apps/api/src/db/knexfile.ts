/**
 * Single Knex configuration: the knex CLI reads it for migrations and seeds; the app builds its instance from it.
 */
import { join } from 'node:path';
import type { Knex } from 'knex';
import { config } from '../config.ts';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: config.DATABASE_URL,
  pool: { min: 0, max: config.DB_POOL_MAX }, // per process; behind a pooler this can go up
  migrations: {
    directory: join(import.meta.dirname, 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts'],
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: join(import.meta.dirname, 'seeds'),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export default knexConfig;
