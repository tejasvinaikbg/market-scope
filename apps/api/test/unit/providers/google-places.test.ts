/** Google Places (New) adapter tests with a fake fetch: the body, the parser, the category rule, dedupe across types, paging, the split of a crowded rectangle, errors. No network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTextSearchBody,
  toPlace,
  assignCategory,
  quadrants,
  createGooglePlacesProvider,
  FIELD_MASK,
  PAGE_SIZE,
  MAX_PAGES,
  type GooglePlace,
} from '../../../src/providers/google-places.ts';

const tile = { south: 12.925, west: 77.6, north: 12.95, east: 77.625 };
const supermarket = { categoryId: 1, slug: 'supermarket', selectors: [], googleTypes: ['supermarket'] };
const pharmacy = { categoryId: 2, slug: 'pharmacy', selectors: [], googleTypes: ['pharmacy', 'drugstore'] };
const grocery = { categoryId: 4, slug: 'grocery_store', selectors: [], googleTypes: ['grocery_store'] };
/** Real answers for the Koramangala cell, recorded once and trimmed to the fields the mask asks for. */
const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/google-places.json', import.meta.url), 'utf8')) as Record<string, GooglePlace[]>;

interface Call {
  headers: Record<string, string>;
  body: any;
}
/** A fake Google that records every request and answers by includedType from the fixture, unless `answer` has something else to say. */
function fake(answer?: (body: any, n: number) => Response | undefined) {
  const calls: Call[] = [];
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    calls.push({ headers: init!.headers as Record<string, string>, body });
    return answer?.(body, calls.length) ?? Response.json({ places: fixture[body.includedType] ?? [] });
  }) as unknown as typeof fetch;
  return { calls, provider: createGooglePlacesProvider({ apiKey: 'k', userAgent: 't', fetchImpl }) };
}

test('the body asks for one type inside the rectangle, strictly, a page at a time', () => {
  assert.deepEqual(buildTextSearchBody(tile, 'grocery_store'), {
    textQuery: 'grocery store',
    includedType: 'grocery_store',
    strictTypeFiltering: true,
    pageSize: PAGE_SIZE,
    languageCode: 'en',
    locationRestriction: { rectangle: { low: { latitude: 12.925, longitude: 77.6 }, high: { latitude: 12.95, longitude: 77.625 } } },
  });
  assert.equal(buildTextSearchBody(tile, 'supermarket', 'tok').pageToken, 'tok');
});

test('toPlace: the Google id, name and address; an unnamed place is still a place; no position or closed for good is dropped; the types ride in tags', () => {
  const p = toPlace(fixture.supermarket![0]!, supermarket)!;
  assert.deepEqual([p.providerPlaceId, p.name, p.categoryId, p.lat, p.lng], ['ChIJSxap2FQUrjsRJPDNEqaJ8h4', 'Xpress Home Needs', 1, 12.9255802, 77.6086426]);
  assert.match(p.address!, /Tavarekere/);
  assert.equal(p.tags.primaryType, 'supermarket');
  assert.ok(p.tags.types!.split(',').includes('grocery_store'));
  const bare: GooglePlace = { id: 'x', location: { latitude: 1, longitude: 2 } };
  assert.deepEqual([toPlace(bare, pharmacy)!.name, toPlace(bare, pharmacy)!.address, toPlace(bare, pharmacy)!.tags], ['Unnamed pharmacy', null, {}]);
  assert.equal(toPlace({ id: 'y', displayName: { text: 'Gone' } }, pharmacy), null);
  assert.equal(toPlace({ ...bare, businessStatus: 'CLOSED_PERMANENTLY' }, pharmacy), null);
});

test('assignCategory: the category whose types include the primary type wins, else the first that found the place', () => {
  const relianceFresh = fixture.supermarket!.find((p) => p.displayName?.text === 'Reliance Fresh')!;
  assert.equal(assignCategory(relianceFresh, [grocery, supermarket]), supermarket); // primaryType supermarket
  assert.equal(assignCategory(fixture.pharmacy![0]!, [pharmacy, grocery]), pharmacy); // primaryType 'store': matches nobody
});

test('quadrants: four quarters that tile the rectangle, south-west first', () => {
  const q = quadrants(tile);
  assert.equal(q.length, 4);
  assert.deepEqual(q[0], { south: 12.925, west: 77.6, north: 12.9375, east: 77.6125 });
  assert.deepEqual(q[3], { south: 12.9375, west: 77.6125, north: 12.95, east: 77.625 });
});

test('one request per type with the key and the field mask; a place found by two types or two categories is filed once', async () => {
  const { calls, provider } = fake();
  const out = await provider.discover(tile, [supermarket, pharmacy, grocery]);
  assert.deepEqual(
    calls.map((c) => c.body.includedType),
    ['supermarket', 'pharmacy', 'drugstore', 'grocery_store'],
  );
  assert.deepEqual([calls[0]!.headers['X-Goog-Api-Key'], calls[0]!.headers['X-Goog-FieldMask'], calls[0]!.headers['User-Agent']], ['k', FIELD_MASK, 't']);
  assert.equal(out.length, new Set(out.map((p) => p.providerPlaceId)).size); // no duplicates
  const category = new Map(out.map((p) => [p.name, p.categoryId]));
  assert.equal(category.get('Wellness Forever Phamacy - 60 Feet Road, 5th Block, Koramangala'), 2); // pharmacy and drugstore both returned it
  assert.equal(category.get('Xpress Home Needs'), 1); // a supermarket by primary type, though the grocery search returned it too
  assert.equal(category.get('Om Sri Sai Store'), 4);
  assert.equal(category.get('Village Hyper market'), 1); // hypermarket was not asked for: it stays with the search that found it
  assert.equal(out.length, 8);
});

test('pages follow the token up to the maximum; a place outside the rectangle is dropped', async () => {
  const outside: GooglePlace = { id: 'far', displayName: { text: 'Far' }, location: { latitude: 13.1, longitude: 77.7 }, primaryType: 'supermarket' };
  const { calls, provider } = fake((_body, n) =>
    n < MAX_PAGES
      ? Response.json({ places: [fixture.supermarket![n - 1]!, outside], nextPageToken: `p${n}` })
      : Response.json({ places: [fixture.supermarket![2]!] }),
  );
  const out = await provider.discover(tile, [supermarket]);
  assert.deepEqual(
    calls.map((c) => c.body.pageToken),
    [undefined, 'p1', 'p2'],
  );
  assert.deepEqual(out.map((p) => p.name).sort(), ["Nature's Basket", 'Reliance Fresh', 'Xpress Home Needs']);
});

test('a rectangle that still has more after the last page is split into quadrants, once', async () => {
  const full: GooglePlace[] = Array.from({ length: PAGE_SIZE }, (_, i) => ({
    id: `s${i}`,
    displayName: { text: `S${i}` },
    location: { latitude: 12.93, longitude: 77.61 },
    primaryType: 'supermarket',
  }));
  const { calls, provider } = fake((body, n) => {
    const { low, high } = body.locationRestriction.rectangle;
    if (low.latitude === tile.south && high.latitude === tile.north) return Response.json({ places: full, nextPageToken: 'more' }); // the whole: always more
    const place: GooglePlace = { id: `q${n}`, displayName: { text: `Q${n}` }, location: { latitude: low.latitude + 0.001, longitude: low.longitude + 0.001 } };
    return Response.json({ places: [place], nextPageToken: 'more' }); // a quarter: also "more", which must not split again
  });
  const out = await provider.discover(tile, [supermarket]);
  assert.equal(calls.length, MAX_PAGES + 4 * MAX_PAGES); // three pages of the whole, then three of each quarter, and no deeper
  assert.equal(out.length, PAGE_SIZE + 4 * MAX_PAGES); // the whole's twenty distinct ids, plus one per quarter page
});

test("a 403 carries Google's own message and is final; a 429 is retried; no types means no request", async () => {
  const denied = fake(() =>
    Response.json(
      { error: { code: 403, message: 'Places API (New) has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED' } },
      { status: 403 },
    ),
  );
  await assert.rejects(denied.provider.discover(tile, [supermarket]), /^Error: google places 403: PERMISSION_DENIED: Places API \(New\) has not been used/);
  assert.equal(denied.calls.length, 1);

  const busy = fake((_body, n) => (n === 1 ? new Response('slow down', { status: 429 }) : undefined));
  assert.equal((await busy.provider.discover(tile, [supermarket])).length, 4);
  assert.equal(busy.calls.length, 2);

  const never = fake(() => {
    throw new Error('must not be called');
  });
  assert.deepEqual(await never.provider.discover(tile, []), []);
  assert.deepEqual(await never.provider.discover(tile, [{ ...supermarket, googleTypes: [] }]), []);
  assert.equal(never.calls.length, 0);
});
