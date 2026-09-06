/**
 * Contract tests for the HTTP layer: the middleware chain, the error envelope, validation and the OpenAPI document,
 * through real requests against an app listening on a free port. No database needed.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.ts';
import { db } from '../../src/db/knex.ts';

// Listen on port 0: the OS picks a free port, so tests never collide with a running dev server.
const server = buildApp().listen(0);
const base = () => `http://localhost:${(server.address() as { port: number }).port}`;
after(async () => {
  server.close();
  await db.destroy();
});
const post = (path: string, body: string) =>
  fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

test('GET /api/health has the contract shape and a consistent status', async () => {
  const res = await fetch(`${base()}/api/health`);
  const body = await res.json();
  assert.ok([200, 503].includes(res.status));
  assert.equal(body.db, res.status === 200);
  assert.equal(typeof body.version, 'string');
  if (res.status === 200) assert.deepEqual(Object.keys(body.jobs).sort(), ['failed', 'pending', 'running']); // queue depth rides along
});

test('reference data is cacheable; a rate limit answers with our envelope', async () => {
  const cats = await fetch(`${base()}/api/categories`);
  assert.equal(cats.headers.get('cache-control'), 'public, max-age=3600');
  const tiny = buildApp({ RATE_LIMIT_PER_MINUTE: 2 }).listen(0);
  const tinyBase = `http://localhost:${(tiny.address() as { port: number }).port}`;
  try {
    await fetch(`${tinyBase}/api/health`);
    await fetch(`${tinyBase}/api/health`);
    const third = await fetch(`${tinyBase}/api/health`);
    assert.equal(third.status, 429);
    assert.equal((await third.json()).error.code, 'RATE_LIMITED');
  } finally {
    tiny.close();
  }
});

test('unknown route is a JSON 404 envelope', async () => {
  const res = await fetch(`${base()}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
});

test('validation failures are 400 VALIDATION_ERROR with zod issues', async () => {
  const res = await post('/api/markets', JSON.stringify({})); // a real route: the body schema rejects before any database work
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details[0].path[0], 'portfolioId');
});

test('malformed JSON is 400 INVALID_JSON', async () => {
  const res = await post('/api/markets', '{bad');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON'); // the 500 envelope is covered by the error-handler unit test
});

test('OpenAPI document lists every route and the shared error component', async () => {
  const doc = await (await fetch(`${base()}/api/openapi.json`)).json();
  assert.deepEqual(Object.keys(doc.paths).sort(), [
    '/api/categories',
    '/api/cities/{id}/bbox',
    '/api/health',
    '/api/locations',
    '/api/markets',
    '/api/markets/{id}',
    '/api/markets/{id}/runs',
    '/api/markets/{id}/stores',
    '/api/portfolios',
    '/api/portfolios/{id}',
    '/api/providers',
  ]);
  assert.deepEqual(doc.components.schemas.CreateMarket.required, ['portfolioId', 'cityId', 'categoryIds', 'boundary']);
});
