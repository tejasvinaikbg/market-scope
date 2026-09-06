/**
 * The route suites' own database, in a Postgres container of its own (docker-compose `db-test`), so no server can ever
 * share it: its URL is TEST_DATABASE_URL, or the dev database's name with `_test` appended, and it must not be the dev
 * database. `prepare` waits for the container, creates the database when it is missing, then migrates and seeds it, so
 * every run starts from the current schema; the suites clean their own rows.
 */
import pg from 'pg';
import knexFactory from 'knex';
import knexConfig from '../src/db/knexfile.ts';

export function testDatabaseUrl(env: { DATABASE_URL?: string; TEST_DATABASE_URL?: string }): string {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const dev = new URL(env.DATABASE_URL);
  const url = new URL(env.TEST_DATABASE_URL ?? dev.href);
  if (!env.TEST_DATABASE_URL) url.pathname = `${dev.pathname}_test`;
  if (url.host === dev.host && url.pathname === dev.pathname) {
    throw new Error(`the route tests must not run against the dev database (${dev.pathname.slice(1)}); set TEST_DATABASE_URL to another one`);
  }
  return url.href;
}

/** A connection to the server, retried for up to 30 s while it comes up; then a plain message if it never does. */
async function connectWhenReady(connectionString: string): Promise<pg.Client> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    const client = new pg.Client({ connectionString });
    try { await client.connect(); return client; } catch (err) { lastError = err; await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error(`cannot reach the test database at ${new URL(connectionString).host} (${(lastError as Error).message}); start it with npm run db:test:up`);
}

/** Create the database when it is missing (Postgres has no IF NOT EXISTS for that), then bring it to the current schema. */
export async function prepareTestDatabase(url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';                                            // the maintenance database every server has
  const client = await connectWhenReady(admin.href);                       // the container may have started a moment ago
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
  } finally {
    await client.end();
  }
  const k = knexFactory({ ...knexConfig, connection: url });
  try {
    await k.migrate.latest();
    await k.seed.run();
  } finally {
    await k.destroy();
  }
}
