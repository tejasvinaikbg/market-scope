/**
 * Discovery against the real database with the fixture places provider: tiles, the boundary filter, the upsert on a re-run,
 * partial and failed outcomes, and the job that the create request queues.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { discoverStores } from '../../src/jobs/discover-stores.ts';
import { createJobRunner } from '../../src/jobs/runner.ts';
import { MARKET_PIPELINE, runPipeline } from '../../src/jobs/pipeline.ts';
import { jobsQueries } from '../../src/queries/jobs.ts';
import { createFixturePlacesProvider } from '../../src/providers/fixture-places.ts';
import type { PlacesProvider } from '../../src/providers/places.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const fixture = createFixturePlacesProvider(new URL('../../fixtures/overpass.json', import.meta.url).pathname);
const quiet = () => { };
let portfolioId = 0;
const markets: number[] = [];

before(async () => {
  const form = new FormData();
  form.append('name', 'test-discovery');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
});
after(async () => {
  if (markets.length) await db('markets').whereIn('id', markets).del();   // stores and jobs go with them (ON DELETE CASCADE)
  await db('place_tiles').where({ provider: 'fixture' }).del();           // the cache is shared with the dev database; fixture entries are ours to remove
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

/** Creates a ~20 km² Koramangala market for supermarkets and pharmacies; discovery is queued but not run (JOBS=off in tests). */
async function createMarket() {
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1, 2], boundary: { south: 12.92, west: 77.60, north: 12.956, east: 77.646 } })
  });
  const body = await res.json();
  markets.push(body.id);
  return body;
}
const stores = (marketId: number) => db('discovered_stores').where({ market_id: marketId }).orderBy('name').select('name', 'category_id', 'provider_place_id');

test('create queues one pipeline job and leaves the market pending with no stores', async () => {
  const m = await createMarket();
  assert.deepEqual([m.status, m.storeCount, m.error, m.progress], ['pending', 0, null, null]);
  const jobs = await jobsQueries.forMarket(m.id);
  assert.deepEqual(jobs.map((j) => [j.type, j.status, j.payload]), [[MARKET_PIPELINE, 'pending', { marketId: m.id }]]);
});

test('discovery keeps what is inside the boundary and in the chosen categories; a re-run updates instead of duplicating', async () => {
  const m = await createMarket();
  const first = await discoverStores(m.id, { places: fixture, log: quiet, cacheHours: 0 });
  assert.deepEqual([first.tiles, first.failedTiles, first.stores, first.status], [6, 0, 4, 'ready']);      // 3 rows × 2 columns of 0.025° cells
  assert.deepEqual((await stores(m.id)).map((s) => s.name), ['Apollo Pharmacy', 'FreshMart Koramangala', 'More', 'Unnamed pharmacy']);   // bakery ignored, Far Away Mart outside

  const again = await discoverStores(m.id, { places: fixture, log: quiet, cacheHours: 0 });
  assert.equal(again.stores, 4);
  const one = await (await fetch(`${base}/api/markets/${m.id}`)).json();
  assert.deepEqual([one.status, one.storeCount], ['ready', 4]);
  assert.ok(one.startedAt && one.completedAt);
  assert.deepEqual(one.progress, { tiles: 6, done: 6, failed: 0 });
});

test('one bad tile makes the market partial and names the tile; every tile failing makes it failed', async () => {
  const m = await createMarket();
  let calls = 0;
  const flaky: PlacesProvider = { id: 'fixture', discover: (tile, cats) => (++calls === 2 ? Promise.reject(new Error('overpass 504 from a')) : fixture.discover(tile, cats)) };
  const r = await discoverStores(m.id, { places: flaky, log: quiet, cacheHours: 0 });
  assert.deepEqual([r.failedTiles, r.status], [1, 'partial']);
  const partial = await (await fetch(`${base}/api/markets/${m.id}`)).json();
  assert.match(partial.error, /tile 2\/6: overpass 504/);
  assert.deepEqual(partial.progress, { tiles: 6, done: 6, failed: 1 });

  const dead: PlacesProvider = { id: 'fixture', discover: () => Promise.reject(new Error('down')) };
  assert.equal((await discoverStores(m.id, { places: dead, log: quiet, cacheHours: 0 })).status, 'failed');
});

test('a cell answered for one market serves the next market that covers it; other categories are another question', async () => {
  await db('place_tiles').where({ provider: 'fixture' }).del();          // start from an empty cache
  const calls: string[] = [];
  const counting: PlacesProvider = { id: 'fixture', discover: (tile, cats) => { calls.push(`${tile.south},${tile.west}`); return fixture.discover(tile, cats); } };
  const a = await createMarket();
  const first = await discoverStores(a.id, { places: counting, log: quiet, cacheHours: 24 });
  assert.deepEqual([first.tiles, first.cachedTiles, calls.length], [6, 0, 6]);                          // every cell asked once
  const b = await createMarket();                                                                          // same boundary, same categories
  const second = await discoverStores(b.id, { places: counting, log: quiet, cacheHours: 24 });
  assert.deepEqual([second.cachedTiles, calls.length, second.stores], [6, 6, 4]);                         // no new calls; the same 4 stores
  const cached = await db('place_tiles').count('* as n').first();
  assert.ok(Number(cached?.n) >= 6);
});

test('the runner picks up the queued pipeline job and the market comes out ready', async () => {
  const m = await createMarket();
  const runner = createJobRunner({ [MARKET_PIPELINE]: ({ marketId }) => runPipeline(Number(marketId)) });
  // The pipeline uses the process-wide provider, which is the fixture under PLACES=fixture.
  let ran = 0;
  while (await runner.runOnce()) ran++;
  assert.ok(ran >= 1);
  const one = await (await fetch(`${base}/api/markets/${m.id}`)).json();
  assert.deepEqual([one.status, one.storeCount], ['ready', 4]);
  assert.equal((await jobsQueries.forMarket(m.id))[0]?.status, 'done');
});