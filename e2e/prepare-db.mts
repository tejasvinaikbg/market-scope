/**
 * Runs before the API starts for an end-to-end run: the e2e database exists, is migrated and seeded, and holds nothing
 * from a previous run. Node runs this directly; it reuses the route tests' own database helper.
 */
import knex from 'knex';
import { prepareTestDatabase } from '../apps/api/test/database.ts';

const url = process.env.DATABASE_URL!;
await prepareTestDatabase(url);
const k = knex({ client: 'pg', connection: url });
try {
  await k('markets').del();
  await k('portfolios').del();
  await k('place_tiles').del();
  await k('jobs').del();
} finally {
  await k.destroy();
}
console.log(`e2e database ready: ${new URL(url).pathname.slice(1)}`);
