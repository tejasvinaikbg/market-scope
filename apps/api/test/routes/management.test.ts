/**
 * What can be done to a market after it exists: run it again (queued afresh, the rows rewritten by the run), and delete it
 * with everything found for it. Neither while a run is in flight.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { runPipeline } from '../../src/jobs/pipeline.ts';
import { jobsQueries } from '../../src/queries/jobs.ts';
import { marketsQueries } from '../../src/queries/markets.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
let portfolioId = 0;
const markets: number[] = [];
const market = async (id: number) => (await fetch(`${base}/api/markets/${id}`)).json();
/** The pipeline by hand, and the queued job marked done as a worker would have: the market is then finished and not busy. */
const settle = async (id: number) => { await runPipeline(id); await db('jobs').where({ market_id: id, status: 'pending' }).update({ status: 'done' }); };
async function createMarket() {
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1, 2], boundary: { south: 12.92, west: 77.60, north: 12.956, east: 77.646 } })
  });
  const body = await res.json();
  markets.push(body.id);
  return body;
}

before(async () => {
  const form = new FormData();
  form.append('name', 'test-management');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
  await fetch(`${base}/api/cities/1/bbox`);
});
after(async () => {
  if (markets.length) await db('markets').whereIn('id', markets).del();
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

test('a finished market can be run again: queued afresh, its rows kept until the run rewrites them, one more job in the queue', async () => {
  const m = await createMarket();
  await settle(m.id);                                                                                  // by hand: the worker is off in tests
  assert.deepEqual([(await market(m.id)).status, (await market(m.id)).storeCount, (await market(m.id)).matched, (await market(m.id)).busy], ['ready', 4, 1, false]);
  const res = await fetch(`${base}/api/markets/${m.id}/runs`, { method: 'POST' });
  assert.equal(res.status, 202);
  const queued = await res.json();
  assert.deepEqual([queued.status, queued.error, queued.progress, queued.storeCount, queued.matched, queued.busy], ['pending', null, null, 4, 1, true]);
  const jobs = await jobsQueries.forMarket(m.id);
  assert.deepEqual(jobs.map((j) => j.status).sort(), ['done', 'pending']);                             // the create's job, settled, and this one
  await settle(m.id);                                                                                  // and the run brings it back to the same place
  assert.deepEqual([(await market(m.id)).status, (await market(m.id)).storeCount, (await market(m.id)).busy], ['ready', 4, false]);
});

test('neither a run again nor a delete is allowed while a run is in flight', async () => {
  const m = await createMarket();                                                                      // pending: its job is queued
  const rerun = await fetch(`${base}/api/markets/${m.id}/runs`, { method: 'POST' });
  assert.deepEqual([rerun.status, (await rerun.json()).error.code], [409, 'RUN_IN_PROGRESS']);
  const del = await fetch(`${base}/api/markets/${m.id}`, { method: 'DELETE' });
  assert.deepEqual([del.status, (await del.json()).error.code], [409, 'RUN_IN_PROGRESS']);
  assert.equal((await market(m.id)).status, 'pending');
});

test('deleting a finished market takes its stores, placements, pairs and jobs with it', async () => {
  const m = await createMarket();
  await settle(m.id);
  const rows = async () => Promise.all([
    db('discovered_stores').where({ market_id: m.id }).count('* as n').first(),
    db('market_portfolio_stores').where({ market_id: m.id }).count('* as n').first(),
    db('jobs').where({ market_id: m.id }).count('* as n').first(),
  ]).then((r) => r.map((x) => Number(x?.n)));
  assert.deepEqual(await rows(), [4, 10, 1]);
  const res = await fetch(`${base}/api/markets/${m.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.equal((await fetch(`${base}/api/markets/${m.id}`)).status, 404);
  assert.deepEqual(await rows(), [0, 0, 0]);
  assert.equal((await fetch(`${base}/api/markets/999999`, { method: 'DELETE' })).status, 404);
});

test('a finished market can be edited in place: new decisions stored, what was found discarded, queued afresh', async () => {
  const m = await createMarket();
  await settle(m.id);
  assert.equal((await market(m.id)).storeCount, 4);
  const res = await fetch(`${base}/api/markets/${m.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [2], boundary: { south: 12.93, west: 77.61, north: 12.95, east: 77.64 } })
  });
  assert.equal(res.status, 202);
  const edited = await res.json();
  assert.deepEqual([edited.status, edited.storeCount, edited.matched, edited.busy, edited.categories.map((c: { slug: string }) => c.slug), edited.boundary.south], ['pending', 0, 0, true, ['pharmacy'], 12.93]);
  assert.equal(edited.name, m.name);                                                                  // the name survives an edit that does not set one
  assert.ok(edited.areaSqKm < m.areaSqKm);                                                             // measured again
  await settle(m.id);
  const after = await market(m.id);
  assert.deepEqual([after.status, after.storeCount, after.busy], ['ready', 2, false]);                  // the two pharmacies inside the smaller rectangle
  const bad = await fetch(`${base}/api/markets/${m.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1], boundary: { south: 12.8, west: 77.4, north: 13.2, east: 77.9 } }) });
  assert.equal((await bad.json()).error.code, 'AREA_TOO_LARGE');                                        // the same ladder as create
});

test('busy is decided by the jobs, not the status word: a market queued before the queue existed is not busy', async () => {
  const m = await createMarket();
  await db('jobs').where({ market_id: m.id }).del();                                                   // the shape of markets 1–6 on the dev database
  assert.deepEqual([(await market(m.id)).status, (await market(m.id)).busy], ['pending', false]);
  assert.equal((await fetch(`${base}/api/markets/${m.id}/runs`, { method: 'POST' })).status, 202);   // so it can be run
  assert.equal((await market(m.id)).busy, true);                                                       // and now it is busy, until the run ends
  await db('jobs').where({ market_id: m.id }).del();
  await marketsQueries.reset(m.id);
  assert.equal((await fetch(`${base}/api/markets/${m.id}`, { method: 'DELETE' })).status, 204);      // or deleted
});
