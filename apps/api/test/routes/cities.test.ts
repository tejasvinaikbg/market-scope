/**
 * Route tests for GET /api/cities/:id/bbox against the real database, with the fixture geocoder (GEOCODER=fixture)
 * so the suite never calls Nominatim. The cache is cleared before AND after: a previous run or a manual curl
 * leaves the row warm, and the first assertion depends on it being cold.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const clearCache = () => db('cities').update({ bbox: null, centre: null, bbox_fetched_at: null });

before(async () => { await clearCache(); });
after(async () => { await clearCache(); server.close(); await db.destroy(); });

test('first call geocodes and caches; second call is served from the row', async () => {
  const first = await (await fetch(`${base}/api/cities/1/bbox`)).json();
  assert.equal(first.cached, false);
  assert.ok(first.bbox.south < first.centre.lat && first.centre.lat < first.bbox.north);
  const second = await (await fetch(`${base}/api/cities/1/bbox`)).json();
  assert.equal(second.cached, true);
  assert.deepEqual(second.bbox, first.bbox);
});

test('unknown and malformed ids', async () => {
  assert.equal((await fetch(`${base}/api/cities/999/bbox`)).status, 404);
  assert.equal((await fetch(`${base}/api/cities/abc/bbox`)).status, 400);
});
