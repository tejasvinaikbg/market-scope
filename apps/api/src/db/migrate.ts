/**
 * Bring a database to the current schema and reference data from a container, where the knex CLI (a dev tool) is not
 * installed: `node src/db/migrate.ts`. Run it as a release step, before the new API and worker start, never at their start.
 */
import knexFactory from 'knex';
import knexConfig from './knexfile.ts';

const k = knexFactory(knexConfig);
try {
  const [, migrations] = await k.migrate.latest();
  const [seeds] = await k.seed.run();
  console.log(`migrations applied: ${migrations.length}; seed files run: ${seeds.length}`);
} finally {
  await k.destroy();
}
