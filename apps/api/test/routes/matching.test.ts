/**
 * Matching against the real database, after the full pipeline has run with the fixtures: the sample's FreshMart is paired
 * with the FreshMart discovery found 120-odd metres north of it, a nearer pharmacy is not a supermarket and is passed
 * over, a store with no known category takes the nearest of any kind, and a re-run clears a pair that no longer holds.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';
import { geocodePortfolio } from '../../src/jobs/geocode-portfolio.ts';
import { placePortfolio } from '../../src/jobs/place-portfolio.ts';
import { discoverStores } from '../../src/jobs/discover-stores.ts';
import { matchPortfolio } from '../../src/jobs/match-portfolio.ts';
import { createFixtureGeocoder } from '../../src/providers/fixture-geocoder.ts';
import { createFixturePlacesProvider } from '../../src/providers/fixture-places.ts';

const server = buildApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const quiet = () => { };
let portfolioId = 0;
let marketId = 0;
const stores = async (query = '') => (await fetch(`${base}/api/markets/${marketId}/stores${query}`)).json();
const market = async () => (await fetch(`${base}/api/markets/${marketId}`)).json();
const moveStore = (name: string, lat: number, lng: number) =>
  db('portfolio_stores').where({ portfolio_id: portfolioId, store_name: name }).update({ location: db.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [lng, lat]) });

before(async () => {
  const form = new FormData();
  form.append('name', 'test-matching');
  form.append('file', new Blob([await readFile(new URL('../../fixtures/sample_portfolio_bengaluru.csv', import.meta.url), 'utf8')]), 'sample.csv');
  portfolioId = (await (await fetch(`${base}/api/portfolios`, { method: 'POST', body: form })).json()).id;
  await fetch(`${base}/api/cities/1/bbox`);
  const res = await fetch(`${base}/api/markets`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portfolioId, cityId: 1, categoryIds: [1, 2], boundary: { south: 12.92, west: 77.60, north: 12.956, east: 77.646 } })
  });
  marketId = (await res.json()).id;
  const fixturesDir = new URL('../../fixtures/', import.meta.url).pathname;
  await geocodePortfolio(marketId, { geocoder: createFixtureGeocoder(fixturesDir + 'geocode.json'), log: quiet });
  await placePortfolio(marketId, quiet);
  await discoverStores(marketId, { places: createFixturePlacesProvider(fixturesDir + 'overpass.json'), log: quiet, cacheHours: 0 });   // matching runs inside
});
after(async () => {
  await db('markets').where({ id: marketId }).del();
  await db('portfolios').where({ id: portfolioId }).del();
  server.close();
  await db.destroy();
});

test('discovery ends with the pairs in place: the sample FreshMart is the FreshMart it found, 120-odd metres away', async () => {
  assert.equal((await market()).matched, 1);
  const body = await stores();
  const fresh = body.stores.find((s: { id: string; name: string }) => s.id.startsWith('p:') && s.name === 'FreshMart Koramangala');
  assert.equal(fresh.match.name, 'FreshMart Koramangala');
  assert.match(fresh.match.id, /^d:\d+$/);
  assert.ok(fresh.match.distanceM > 100 && fresh.match.distanceM < 150, `distance ${fresh.match.distanceM}`);
  assert.ok(body.stores.filter((s: { match: unknown }) => s.match).length === 1);                     // nobody else found a partner
  assert.equal(body.counts.matched, 1);
  assert.ok(body.stores.filter((s: { id: string }) => s.id.startsWith('d:')).every((s: { match: unknown }) => s.match === null));   // the pair is told from the portfolio side
});

test('the matched filter selects the pairs, beside the other layers, never instead of them', async () => {
  const only = await stores('?layers=matched');
  assert.deepEqual(only.stores.map((s: { id: string; name: string }) => [s.id[0], s.name]), [['p', 'FreshMart Koramangala']]);
  const withDiscovered = await stores('?layers=matched,discovered');
  assert.equal(withDiscovered.stores.length, 4 + 1);
  assert.equal((await stores('?layers=matched&q=apollo')).stores.length, 0);
});

test('a nearer store of another category is passed over; a store with no known category takes the nearest of any kind', async () => {
  // The sample FreshMart sits 104 m from the discovered Apollo Pharmacy and 122 m from the discovered FreshMart: the supermarket wins.
  // Move a grocery store to 20 m from that pharmacy: still no pair, a grocery is not a pharmacy...
  await moveStore('Daily Needs Grocery HSR', 12.93618, 77.625);
  await placePortfolio(marketId, quiet);
  assert.equal(await matchPortfolio(marketId, quiet), 1);
  // ...until its category is unknown, when the nearest of any kind will do.
  await db('portfolio_stores').where({ portfolio_id: portfolioId, store_name: 'Daily Needs Grocery HSR' }).update({ category_id: null });
  assert.equal(await matchPortfolio(marketId, quiet), 2);
  const daily = (await stores('?layers=matched')).stores.find((s: { name: string }) => s.name === 'Daily Needs Grocery HSR');
  assert.equal(daily.match.name, 'Apollo Pharmacy');
  assert.ok(daily.match.distanceM < 30);
});

test('a re-run clears a pair that no longer holds, and the radius is the caller\'s to set', async () => {
  await moveStore('FreshMart Koramangala', 12.945, 77.64);                                            // a kilometre and a half away
  await placePortfolio(marketId, quiet);
  assert.equal(await matchPortfolio(marketId, quiet), 1);                                             // Daily Needs keeps its pair, FreshMart lost its own
  assert.equal((await market()).matched, 1);
  assert.equal(await matchPortfolio(marketId, quiet, 2000), 2);                                       // a generous radius finds it again
  assert.equal(await matchPortfolio(marketId, quiet, 1), 0);                                          // a stingy one clears everything
  assert.equal((await stores()).counts.matched, 0);
});
