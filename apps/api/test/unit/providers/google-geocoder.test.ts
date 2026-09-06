/** Google Geocoding adapter tests with a fake fetch answering from recorded answers: the URL, the parsers, the status rule, the guess rules. No network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGeocodeUrl, toBounds, toPoint, checkStatus, createGoogleGeocoder, type GoogleGeocodeResponse } from '../../../src/providers/google-geocoder.ts';

const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/google-geocode.json', import.meta.url), 'utf8')) as Record<string, GoogleGeocodeResponse>;
const city = { south: 12.8334905, west: 77.4598797, north: 13.1426196, east: 77.7840639 };
const whitefield = 'ITPL Main Road, Whitefield, Bengaluru, Karnataka, India';

/** A fake Google that answers by the address in the URL, unless `answer` has something else to say. */
function fake(answer?: (n: number) => Response | undefined) {
  const urls: URL[] = [];
  const fetchImpl = (async (url: string | URL) => {
    urls.push(new URL(String(url)));
    return answer?.(urls.length) ?? Response.json(fixture[urls.at(-1)!.searchParams.get('address')!] ?? { status: 'ZERO_RESULTS' });
  }) as unknown as typeof fetch;
  return { urls, geocoder: createGoogleGeocoder({ apiKey: 'k', userAgent: 't', fetchImpl }) };
}

test('the URL carries the address, the box as south,west|north,east, and the key', () => {
  const q = buildGeocodeUrl('https://g/', 'k', whitefield, city).searchParams;
  assert.deepEqual([q.get('address'), q.get('bounds'), q.get('key')], [whitefield, '12.8334905,77.4598797|13.1426196,77.7840639', 'k']);
  assert.equal(buildGeocodeUrl('https://g/', 'k', 'x').searchParams.has('bounds'), false);
});

test('toBounds: a city from its bounds; toPoint: a road from its centre, a guess or an approximate area is null, outside the box is null', () => {
  const b = toBounds(fixture['Bengaluru, Karnataka, India']!.results![0]!);
  assert.deepEqual([b.bbox.south, b.bbox.north, b.centre.lat, b.displayName], [12.8334905, 13.1424635, 12.9628957, 'Bengaluru, Karnataka, India']);
  const road = fixture[whitefield]!.results![0]!;
  assert.deepEqual(toPoint(road, city), { lat: 12.9865152, lng: 77.7440913 });
  assert.equal(toPoint(road, { south: 12.92, west: 77.6, north: 12.956, east: 77.646 }), null); // Koramangala's box: Whitefield is outside
  assert.equal(toPoint(fixture['No Such Road, Bengaluru, Karnataka, India']!.results![0]!, city), null); // partial_match
  assert.equal(toPoint(fixture['Bengaluru, Karnataka, India']!.results![0]!, city), null); // APPROXIMATE: the middle of the city
});

test('the status word: OK and ZERO_RESULTS answer, two are transient, the rest are final with the message', () => {
  assert.equal(checkStatus({ status: 'ZERO_RESULTS' }).length, 0);
  assert.equal(checkStatus(fixture[whitefield]!).length, 1);
  assert.throws(
    () => checkStatus({ status: 'OVER_QUERY_LIMIT' }),
    (e: Error & { retryable?: boolean }) => e.retryable === true,
  );
  assert.throws(
    () => checkStatus({ status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' }),
    /^Error: google geocoding REQUEST_DENIED: The provided API key is invalid\.$/,
  );
});

test('lookupBounds and lookupPoint through the client: the answers, a transient status retried, a final one not', async () => {
  const { urls, geocoder } = fake();
  assert.equal((await geocoder.lookupBounds('Bengaluru, Karnataka, India'))?.displayName, 'Bengaluru, Karnataka, India');
  assert.deepEqual(await geocoder.lookupPoint(whitefield, city), { lat: 12.9865152, lng: 77.7440913 });
  assert.equal(await geocoder.lookupPoint('No Such Road, Bengaluru, Karnataka, India', city), null);
  assert.equal(await geocoder.lookupBounds('Atlantis'), null);
  assert.deepEqual([urls.length, urls[1]!.searchParams.get('bounds')?.startsWith('12.83'), urls[0]!.searchParams.get('key')], [4, true, 'k']);

  const limited = fake((n) => (n === 1 ? Response.json({ status: 'OVER_QUERY_LIMIT' }) : undefined));
  assert.ok(await limited.geocoder.lookupBounds('Bengaluru, Karnataka, India'));
  assert.equal(limited.urls.length, 2);
  const denied = fake(() => Response.json({ status: 'REQUEST_DENIED', error_message: 'bad key' }));
  await assert.rejects(denied.geocoder.lookupPoint(whitefield, city), /REQUEST_DENIED: bad key/);
  assert.equal(denied.urls.length, 1);
});
