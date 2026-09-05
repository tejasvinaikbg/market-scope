import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.ts';

// Listen on port 0: the OS picks a free port, so tests never collide with a running dev server.
const server = buildApp().listen(0);
const base = () => `http://localhost:${(server.address() as { port: number }).port}`;
after(() => server.close());
const post = (path: string, body: string) => fetch(`${base()}${path}`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body
});

test('GET /api/health reports healthy and the version', async () => {
	console.log(`Testing ${base()}/api/health`);
	const res = await fetch(`${base()}/api/health`);
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { healthy: true, version: '1.0.0' });
});

test('unknown route is a JSON 404 envelope', async () => {
	const res = await fetch(`${base()}/api/nope`);
	assert.equal(res.status, 404);
	assert.equal((await res.json()).error.code, 'NOT_FOUND');
});
test('validation failures are 400 VALIDATION_ERROR with zod issues', async () => {
	const res = await post('/api/echo', JSON.stringify({ name: '' }));
	assert.equal(res.status, 400);
	const body = await res.json();
	assert.equal(body.error.code, 'VALIDATION_ERROR');
	assert.equal(body.error.details[0].path[0], 'name');
});
test('malformed JSON is 400 INVALID_JSON, a thrown Error is 500 INTERNAL_SERVER_ERROR without a stack', async () => {
	assert.equal((await post('/api/echo', '{bad')).status, 400);
	const res = await fetch(`${base()}/api/boom`);
	assert.equal(res.status, 500);
	assert.deepEqual(await res.json(), { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } });
});