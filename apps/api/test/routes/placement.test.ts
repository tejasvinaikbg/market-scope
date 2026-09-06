/**
 * Placement against the real database: the sample portfolio over the Koramangala rectangle — one store inside, the rest
 * outside, the unlocated ones counted as such until geocoding finds them; a re-run moves them; the market read carries the counts.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { placePortfolio } from '../../src/jobs/place-portfolio.ts';
import { geocodePortfolio } from '../../src/jobs/geocode-portfolio.ts';
import { createFixtureGeocoder } from '../../src/providers/fixture-geocoder.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const fixture = createFixtureGeocoder(new URL('../../fixtures/geocode.json', import.meta.url).pathname);
const quiet = () => {};
let portfolioId = 0;
let marketId = 0;

before(async () => {
  const form = new FormData();
  form.append('name', 'test-placement');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
  await fetch(`${base}/api/cities/1/bbox`);
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1], boundary: { south: 12.92, west: 77.6, north: 12.956, east: 77.646 } }),
  });
  marketId = (await res.json()).id;
});
after(async () => {
  await db('markets').where({ id: marketId }).del();
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

test('before geocoding: the seven uploaded points are judged, the three without a point are unlocated', async () => {
  assert.deepEqual(await placePortfolio(marketId, quiet), { inside: 1, outside: 6, unlocated: 3 }); // only FreshMart Koramangala is inside
  const inside = await db('market_portfolio_stores as p')
    .join('portfolio_stores as s', 's.id', 'p.portfolio_store_id')
    .where({ 'p.market_id': marketId, placement: 'inside' })
    .select('s.store_name');
  assert.deepEqual(
    inside.map((r) => r.store_name),
    ['FreshMart Koramangala'],
  );
});

test('after geocoding, a re-run moves the located stores to their side; the market read carries the counts', async () => {
  await geocodePortfolio(marketId, { geocoder: fixture, log: quiet });
  assert.deepEqual(await placePortfolio(marketId, quiet), { inside: 1, outside: 9, unlocated: 0 }); // the three are in the city but not in Koramangala
  const m = await (await fetch(`${base}/api/markets/${marketId}`)).json();
  assert.deepEqual(m.placement, { inside: 1, outside: 9, unlocated: 0 });
  assert.equal(m.placement.inside + m.placement.outside + m.placement.unlocated, 10); // always the whole portfolio
});

test('a point exactly on the edge counts as inside (ST_Covers, not ST_Contains)', async () => {
  const [{ id }] = await db('portfolio_stores').where({ portfolio_id: portfolioId, store_name: 'FreshMart Koramangala' }).select('id');
  await db('portfolio_stores')
    .where({ id })
    .update({ location: db.raw('ST_SetSRID(ST_MakePoint(77.60, 12.92), 4326)::geography') }); // the south-west corner
  assert.equal((await placePortfolio(marketId, quiet)).inside, 1);
});
