/**
 * Geocoding against the real database with the fixture geocoder: the three sample stores without coordinates get points
 * inside the city, a re-run asks about nobody, a miss is recorded as not found, the market read counts it all, and the
 * market's choice of geocoder is honoured — or, without its key, fails the market and stops the pipeline.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { geocodePortfolio } from '../../src/jobs/geocode-portfolio.ts';
import { createFixtureGeocoder } from '../../src/providers/fixture-geocoder.ts';
import type { Geocoder } from '../../src/providers/geocoder.ts';
import { runPipeline } from '../../src/jobs/pipeline.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const fixture = createFixtureGeocoder(new URL('../../fixtures/geocode.json', import.meta.url).pathname);
const quiet = () => {};
let portfolioId = 0;
let marketId = 0;

before(async () => {
  const form = new FormData();
  form.append('name', 'test-geocoding');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
  await fetch(`${base}/api/cities/1/bbox`); // the city box the geocoder searches inside (cached on the row)
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

test('the three stores without coordinates are located inside the city; the seven uploaded ones are untouched', async () => {
  const r = await geocodePortfolio(marketId, { geocoder: fixture, log: quiet });
  assert.deepEqual(r, { total: 3, located: 3, notFound: 0, errors: 0, status: 'done' });
  const rows = await db('portfolio_stores').where({ portfolio_id: portfolioId }).select('location_source', 'geocode_status').orderBy('row_number');
  assert.equal(rows.filter((s) => s.location_source === 'uploaded' && s.geocode_status === null).length, 7);
  assert.equal(rows.filter((s) => s.location_source === 'geocoded' && s.geocode_status === 'ok').length, 3);
  const m = await (await fetch(`${base}/api/markets/${marketId}`)).json();
  assert.deepEqual(m.geocoding, { total: 3, done: 3, failed: 0 });
});

test('a re-run asks about nobody: every store already has a point', async () => {
  let calls = 0;
  const counting: Geocoder = {
    lookupBounds: fixture.lookupBounds,
    lookupPoint: (q, b) => {
      calls++;
      return fixture.lookupPoint(q, b);
    },
  };
  assert.deepEqual(await geocodePortfolio(marketId, { geocoder: counting, log: quiet }), { total: 0, located: 0, notFound: 0, errors: 0, status: 'done' });
  assert.equal(calls, 0);
});

test('an address the geocoder cannot find is recorded as not found, and an error as an error; both are retried next run', async () => {
  await db('portfolio_stores')
    .where({ portfolio_id: portfolioId, location_source: 'geocoded' })
    .update({ location: null, location_source: null, geocode_status: null }); // forget the three
  const missing: Geocoder = { lookupBounds: fixture.lookupBounds, lookupPoint: async () => null };
  assert.deepEqual(await geocodePortfolio(marketId, { geocoder: missing, log: quiet }), { total: 3, located: 0, notFound: 3, errors: 0, status: 'done' });
  assert.deepEqual((await (await fetch(`${base}/api/markets/${marketId}`)).json()).geocoding, { total: 3, done: 0, failed: 3 });
  const broken: Geocoder = {
    lookupBounds: fixture.lookupBounds,
    lookupPoint: async () => {
      throw new Error('nominatim 503');
    },
  };
  assert.deepEqual(await geocodePortfolio(marketId, { geocoder: broken, log: quiet }), { total: 3, located: 0, notFound: 0, errors: 3, status: 'done' }); // still asked: not found is not final
  assert.deepEqual(await geocodePortfolio(marketId, { geocoder: fixture, log: quiet }), { total: 3, located: 3, notFound: 0, errors: 0, status: 'done' });
});

test('a market that chose Google is located by the Google geocoder', async () => {
  await db('markets').where({ id: marketId }).update({ geocoder_provider: 'google' }); // the request refuses the choice without a key; the job must still honour it
  await db('portfolio_stores')
    .where({ portfolio_id: portfolioId, location_source: 'geocoded' })
    .update({ location: null, location_source: null, geocode_status: null });
  const asked: string[] = [];
  const google: Geocoder = { lookupBounds: fixture.lookupBounds, lookupPoint: (q, b) => fixture.lookupPoint(q, b) };
  const resolve = (choice: string) => {
    asked.push(choice);
    return choice === 'google' ? google : fixture;
  };
  assert.deepEqual(await geocodePortfolio(marketId, { geocoder: resolve, log: quiet }), { total: 3, located: 3, notFound: 0, errors: 0, status: 'done' });
  assert.deepEqual(asked, ['google']);
});

test('a market whose geocoder lost its key fails at once with the reason, and the pipeline goes no further', async () => {
  const unkeyed = (choice: string) => {
    if (choice === 'google') throw new Error('Google Geocoding API is not configured: set GOOGLE_GEOCODING_API_KEY');
    return fixture;
  };
  await runPipeline(marketId, { geocode: { geocoder: unkeyed, log: quiet } });
  const m = await (await fetch(`${base}/api/markets/${marketId}`)).json();
  assert.deepEqual([m.status, m.progress, m.storeCount], ['failed', null, 0]); // discovery never ran
  assert.match(m.error, /Google Geocoding API is not configured/);
});
