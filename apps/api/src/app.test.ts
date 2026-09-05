import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.ts';

// Listen on port 0: the OS picks a free port, so tests never collide with a running dev server.
const server = buildApp().listen(0);
const base = () => `http://localhost:${(server.address() as { port: number }).port}`;
after(() => server.close());

test('GET /api/health reports healthy and the version', async () => {
	console.log(`Testing ${base()}/api/health`);
	const res = await fetch(`${base()}/api/health`);
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { healthy: true, version: '0.1.0' });
});