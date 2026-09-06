/** Route test for GET /api/providers under the test environment (no Google keys): OSM on, Google not configured. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
after(async () => { server.close(); await db.destroy(); });

test('lists both kinds with availability and a reason', async () => {
  const p = await (await fetch(`${base}/api/providers`)).json();
  assert.deepEqual(p.places.map((o: { id: string; enabled: boolean }) => [o.id, o.enabled]), [['overpass', true], ['google', false]]);
  assert.equal(p.geocoding[1].reason, 'not configured');
});