/** Overpass adapter tests with a fake fetch: the query, the parser, retry across mirrors, no retry on a 400, the timed-out remark. No network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, toPlace, createOverpassProvider } from '../../../src/providers/overpass.ts';

const tile = { south: 12.9, west: 77.6, north: 12.94, east: 77.65 };
const categories = [
  { categoryId: 1, slug: 'supermarket', selectors: [{ key: 'shop', value: 'supermarket' }], googleTypes: [] },
  {
    categoryId: 2,
    slug: 'pharmacy',
    selectors: [
      { key: 'amenity', value: 'pharmacy' },
      { key: 'shop', value: 'chemist' },
    ],
    googleTypes: [],
  },
];

test('the query has a node and a way clause per selector, inside the tile, and asks for centres and tags', () => {
  const q = buildOverpassQuery(tile, categories);
  assert.match(q, /^\[out:json\]\[timeout:25\];\(/);
  assert.ok(q.includes('node["shop"="supermarket"](12.9,77.6,12.94,77.65);'));
  assert.ok(q.includes('way["amenity"="pharmacy"](12.9,77.6,12.94,77.65);'));
  assert.ok(q.includes('node["shop"="chemist"]'));
  assert.ok(q.endsWith(');out center tags;'));
  assert.ok(
    buildOverpassQuery(tile, [{ categoryId: 9, slug: 'x', selectors: [{ key: 'name', value: 'Joe\'s "Mart" \\ Co' }], googleTypes: [] }]).includes(
      '"Joe\'s \\"Mart\\" \\\\ Co"',
    ),
  );
});

test('toPlace: ways use their centre, a brand stands in for a name, unnamed shops are still shops, non-matches are dropped', () => {
  const way = toPlace(
    { type: 'way', id: 7, center: { lat: 12.91, lon: 77.61 }, tags: { shop: 'supermarket', brand: 'More', 'addr:street': '24th Main' } },
    categories,
  );
  assert.deepEqual([way?.providerPlaceId, way?.name, way?.address, way?.categoryId], ['way/7', 'More', '24th Main', 1]);
  assert.equal(toPlace({ type: 'node', id: 1, lat: 1, lon: 2, tags: { amenity: 'pharmacy' } }, categories)?.name, 'Unnamed pharmacy');
  assert.equal(toPlace({ type: 'node', id: 2, lat: 1, lon: 2, tags: { shop: 'bakery' } }, categories), null);
  assert.equal(toPlace({ type: 'relation', id: 3, tags: { shop: 'supermarket' } }, categories), null); // no position
});

test('a 429 is retried on the next mirror; the answer is parsed', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    calls.push(String(url));
    if (calls.length === 1) return new Response('busy', { status: 429 });
    return Response.json({ elements: [{ type: 'node', id: 9, lat: 12.91, lon: 77.62, tags: { shop: 'supermarket', name: 'X' } }] });
  }) as unknown as typeof fetch;
  const provider = createOverpassProvider({ userAgent: 't', endpoints: ['https://a/', 'https://b/'], fetchImpl });
  const out = await provider.discover(tile, categories);
  assert.deepEqual(calls, ['https://a/', 'https://b/']);
  assert.deepEqual(
    out.map((p) => p.name),
    ['X'],
  );
});

test('a 400 is final; a timed-out remark is transient; no categories means no request', async () => {
  let calls = 0;
  const bad = createOverpassProvider({
    userAgent: 't',
    endpoints: ['https://a/'],
    fetchImpl: (async () => {
      calls++;
      return new Response('syntax error', { status: 400 });
    }) as unknown as typeof fetch,
  });
  await assert.rejects(bad.discover(tile, categories), /overpass 400/);
  assert.equal(calls, 1);

  let n = 0;
  const slow = createOverpassProvider({
    userAgent: 't',
    endpoints: ['https://a/'],
    fetchImpl: (async () => {
      n++;
      return Response.json(n === 1 ? { remark: 'runtime error: Query timed out in "query"' } : { elements: [] });
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(await slow.discover(tile, categories), []);
  assert.equal(n, 2);

  const never = createOverpassProvider({
    userAgent: 't',
    fetchImpl: (async () => {
      throw new Error('must not be called');
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(await never.discover(tile, []), []);
});
