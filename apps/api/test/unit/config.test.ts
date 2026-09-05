/** Unit tests for the environment schema: bad values fail with the variable named, defaults apply, real values win. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Env } from '../../src/config.ts';

const good = { DATABASE_URL: 'postgres://ms:ms@localhost:5432/ms', NOMINATIM_USER_AGENT: 'test (x@y.z)' };

test('applies defaults for optional settings', () => {
  const env = Env.parse(good);
  assert.equal(env.PORT, 4200);
  assert.equal(env.LOG_LEVEL, 'info');
});

test('rejects a non-numeric port and names the variable', () => {
  const r = Env.safeParse({ ...good, PORT: 'abc' });
  assert.equal(r.success, false);
  assert.equal(r.error!.issues[0]!.path[0], 'PORT');
});

test('requires DATABASE_URL and NOMINATIM_USER_AGENT', () => {
  const missing = Env.safeParse({});
  assert.equal(missing.success, false);
  assert.deepEqual(missing.error!.issues.map((i) => i.path[0]).sort(), ['DATABASE_URL', 'NOMINATIM_USER_AGENT']);
});
