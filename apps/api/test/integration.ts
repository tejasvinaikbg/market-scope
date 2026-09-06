/**
 * Runs the route suites against the tests' own database: prepares it, then starts node's test runner on the suites with
 * DATABASE_URL pointing at it, the worker off, the fixture providers on, and the suites one file at a time, because they
 * share that database. Exits with the runner's own status.
 */
import { spawnSync } from 'node:child_process';
import { prepareTestDatabase, testDatabaseUrl } from './database.ts';

const url = testDatabaseUrl(process.env);
await prepareTestDatabase(url);
console.log(`route suites against ${new URL(url).pathname.slice(1)}`);
const run = spawnSync('npx', ['tsx', '--test', '--test-concurrency=1', 'test/routes/**/*.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url, JOBS: 'off', GEOCODER: 'fixture', PLACES: 'fixture', LOG_LEVEL: 'silent' },
});
process.exit(run.status ?? 1);
