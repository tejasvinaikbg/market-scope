/** The tests' own database URL: explicit, or derived from the dev one on the same server, and never the dev one itself. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDatabaseUrl } from '../database.ts';

test('without TEST_DATABASE_URL, the dev database\'s name with _test on the same server', () => {
  assert.equal(testDatabaseUrl({ DATABASE_URL: 'postgres://u:p@localhost:5432/ms' }), 'postgres://u:p@localhost:5432/ms_test');
});

test('an explicit TEST_DATABASE_URL wins, wherever it points', () => {
  assert.equal(testDatabaseUrl({ DATABASE_URL: 'postgres://u:p@localhost:5432/ms', TEST_DATABASE_URL: 'postgres://u:p@db:5433/other' }), 'postgres://u:p@db:5433/other');
});

test('the dev database itself is refused, and so is no DATABASE_URL at all', () => {
  assert.throws(() => testDatabaseUrl({ DATABASE_URL: 'postgres://u:p@localhost:5432/ms', TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/ms' }), /must not run against the dev database \(ms\)/);
  assert.throws(() => testDatabaseUrl({}), /DATABASE_URL is not set/);
});
