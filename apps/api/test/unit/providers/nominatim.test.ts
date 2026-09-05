/** Nominatim geocoder tests with a fake fetch: retry on 429, no retry on 400, empty result is null (no network). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNominatimGeocoder } from '../../../src/providers/nominatim.ts';

const hit = { lat: '12.97', lon: '77.59', display_name: 'Bengaluru', boundingbox: ['12.83', '13.14', '77.46', '77.78'] };
const respond = (responses: Array<() => Response>) => {
  let i = 0;
  return (async () => responses[Math.min(i++, responses.length - 1)]!()) as unknown as typeof fetch;
};

test('retries a 429 and returns the parsed box in south/north/west/east order', async () => {
  const g = createNominatimGeocoder({ userAgent: 't', fetchImpl: respond([() => new Response('', { status: 429 }), () => Response.json([hit])]) });
  const r = await g.lookupBounds('Bengaluru, Karnataka, India');
  assert.deepEqual(r?.bbox, { south: 12.83, north: 13.14, west: 77.46, east: 77.78 });
});

test('does not retry a 400', async () => {
  let calls = 0;
  const g = createNominatimGeocoder({ userAgent: 't', fetchImpl: (async () => { calls++; return new Response('bad', { status: 400 }); }) as unknown as typeof fetch });
  await assert.rejects(g.lookupBounds('x'), /nominatim 400/);
  assert.equal(calls, 1);
});

test('empty result is null, not an error', async () => {
  const g = createNominatimGeocoder({ userAgent: 't', fetchImpl: respond([() => Response.json([])]) });
  assert.equal(await g.lookupBounds('nowhere'), null);
});