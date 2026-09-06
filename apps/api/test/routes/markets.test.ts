/**
 * Route tests for /api/markets against the real database: a legal market, every rung of the validation ladder,
 * reading it back. Uploads its own portfolio first and deletes everything it made.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bboxAreaSqKm } from '@market-scope/shared';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
let portfolioId = 0;
const markets: number[] = [];

before(async () => {
  const form = new FormData();
  form.append('name', 'test-markets');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
});
after(async () => {
  if (markets.length) await db('markets').whereIn('id', markets).del(); // market_categories go with them
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

const koramangala = { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }; // ~20 km²
const wholeCity = { south: 12.8335, west: 77.4599, north: 13.1426, east: 77.7841 };

/** POST /api/markets with sensible defaults; remembers created ids for cleanup. */
async function create(overrides: Record<string, unknown> = {}) {
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1, 2], boundary: koramangala, ...overrides }),
  });
  const body = await res.json();
  if (res.status === 201) markets.push(body.id);
  return { status: res.status, body };
}

test('a legal boundary creates the market, measured by PostGIS, with the categories and boundary echoed back', async () => {
  const { status, body } = await create();
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(Math.abs(body.areaSqKm - bboxAreaSqKm(koramangala)) < 0.2); // spheroid vs sphere: same to within 1 %
  assert.deepEqual(
    body.categories.map((c: { id: number }) => c.id),
    [1, 2],
  );
  assert.deepEqual(body.boundary, koramangala);
  assert.equal(body.name, 'Bengaluru · test-markets');
  assert.deepEqual([body.placesProvider, body.geocoderProvider], ['overpass', 'nominatim']);
  assert.deepEqual([body.status, body.storeCount, body.error], ['pending', 0, null]); // discovery is queued, not run yet

  const one = await (await fetch(`${base}/api/markets/${body.id}`)).json();
  assert.equal(one.cityName, 'Bengaluru');
  const list = await (await fetch(`${base}/api/markets`)).json();
  assert.ok(list.some((m: { id: number }) => m.id === body.id));
});

test('the whole city is over the cap, and the measured area rides in details', async () => {
  const { status, body } = await create({ boundary: wholeCity });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'AREA_TOO_LARGE');
  assert.ok(body.error.details.areaSqKm > 1000);
});

test('shape, categories and providers each fail with their own code', async () => {
  assert.equal((await create({ boundary: { ...koramangala, south: 12.956, north: 12.92 } })).body.error.code, 'INVALID_BOUNDARY');
  assert.equal((await create({ boundary: { ...koramangala, north: 12.9201, east: 77.6001 } })).body.error.code, 'AREA_TOO_SMALL');
  assert.equal((await create({ categoryIds: [1, 999] })).body.error.code, 'UNKNOWN_CATEGORY');
  assert.equal((await create({ categoryIds: [] })).body.error.code, 'VALIDATION_ERROR'); // zod: min(1)
  assert.equal((await create({ placesProvider: 'google' })).body.error.code, 'PROVIDER_UNAVAILABLE');
});

test('an unknown portfolio or market is 404', async () => {
  assert.equal((await create({ portfolioId: 999999 })).status, 404);
  assert.equal((await fetch(`${base}/api/markets/999999`)).status, 404);
});

test('duplicate category ids are collapsed, not rejected', async () => {
  const { status, body } = await create({ categoryIds: [1, 1, 2] });
  assert.equal(status, 201);
  assert.equal(body.categories.length, 2);
});
