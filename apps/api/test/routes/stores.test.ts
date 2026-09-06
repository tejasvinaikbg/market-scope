/**
 * The stores endpoint against the real database, after the full pipeline has run with the fixtures: one list from two
 * tables, filters by layer, category and name, the unlocated portfolio stores apart, and totals that ignore the filter.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { geocodePortfolio } from '../../src/jobs/geocode-portfolio.ts';
import { placePortfolio } from '../../src/jobs/place-portfolio.ts';
import { discoverStores } from '../../src/jobs/discover-stores.ts';
import { createFixtureGeocoder } from '../../src/providers/fixture-geocoder.ts';
import { createFixturePlacesProvider } from '../../src/providers/fixture-places.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const quiet = () => { };
let portfolioId = 0;
let marketId = 0;
const stores = async (query = '') => (await fetch(`${base}/api/markets/${marketId}/stores${query}`)).json();

before(async () => {
  const form = new FormData();
  form.append('name', 'test-stores');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
  await fetch(`${base}/api/cities/1/bbox`);
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1, 2], boundary: { south: 12.92, west: 77.60, north: 12.956, east: 77.646 } })
  });
  marketId = (await res.json()).id;
  // The pipeline by hand, with the fixtures, so the endpoint has something to show.
  const fixturesDir = new URL('../../fixtures/', import.meta.url).pathname;
  await geocodePortfolio(marketId, { geocoder: createFixtureGeocoder(fixturesDir + 'geocode.json'), log: quiet });
  await placePortfolio(marketId, quiet);
  await discoverStores(marketId, { places: createFixturePlacesProvider(fixturesDir + 'overpass.json'), log: quiet, cacheHours: 0 });
});
after(async () => {
  await db('markets').where({ id: marketId }).del();
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

test('no filter: the four discovered stores and the ten placed portfolio stores, in one list, with totals', async () => {
  const body = await stores();
  assert.equal(body.stores.length, 14);
  assert.deepEqual(body.counts, { discovered: 4, portfolioInside: 1, portfolioOutside: 9, portfolioUnlocated: 0, matched: 1 });   // the pair is matching's business (its own test); it is counted here
  assert.deepEqual(body.unlocated, []);
  const fresh = body.stores.find((s: { id: string; name: string }) => s.id.startsWith('p:') && s.name === 'FreshMart Koramangala');   // the fixture discovers a store of the same name
  assert.deepEqual([fresh.layer, fresh.source, fresh.category.slug], ['portfolio_inside', 'uploaded', 'supermarket']);
  assert.ok(body.stores.every((s: { lat: number; lng: number }) => typeof s.lat === 'number' && typeof s.lng === 'number'));
});

test('filters narrow the list and leave the totals alone', async () => {
  const inside = await stores('?layers=portfolio_inside');
  assert.deepEqual(inside.stores.map((s: { name: string }) => s.name), ['FreshMart Koramangala']);
  assert.equal(inside.counts.discovered, 4);                                                          // totals are the whole market
  const pharmacies = await stores('?layers=discovered&categories=pharmacy');
  assert.deepEqual(pharmacies.stores.map((s: { name: string }) => s.name), ['Apollo Pharmacy', 'Unnamed pharmacy']);
  const apollo = await stores('?q=apollo');
  assert.deepEqual(apollo.stores.map((s: { layer: string }) => s.layer).sort(), ['discovered', 'portfolio_outside']);   // one found, one of the user's own
  const both = await stores('?layers=discovered,portfolio_outside&categories=supermarket');
  assert.equal(both.stores.length, 2 + 1);                                                             // FreshMart and More found; More Supermarket JP Nagar outside
});

test('an unlocated portfolio store is listed apart, with the reason', async () => {
  await db('portfolio_stores').where({ portfolio_id: portfolioId, store_name: 'BigBasket Hyperstore Whitefield' }).update({ location: null, location_source: null, geocode_status: 'not_found' });
  await placePortfolio(marketId, quiet);
  const body = await stores();
  assert.deepEqual(body.unlocated.map((u: { name: string; reason: string }) => [u.name, u.reason]), [['BigBasket Hyperstore Whitefield', 'not_found']]);
  assert.deepEqual([body.counts.portfolioOutside, body.counts.portfolioUnlocated, body.stores.length], [8, 1, 13]);
});

test('a bad layer is a validation error; an unknown market is 404', async () => {
  assert.equal((await (await fetch(`${base}/api/markets/${marketId}/stores?layers=bogus`)).json()).error.code, 'VALIDATION_ERROR');
  assert.equal((await fetch(`${base}/api/markets/999999/stores`)).status, 404);
});