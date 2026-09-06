/** Unit tests for the application error helpers: shape, the type guard, and the two shortcuts routes use. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppError, isAppError, notFound, badRequest } from '../../../src/lib/errors.ts';

test('createAppError produces a real Error with status, code and details', () => {
  const err = createAppError(422, 'CUSTOM', 'something specific', { field: 'x' });
  assert.ok(err instanceof Error); // stack traces and `throw` behave normally
  assert.equal(err.message, 'something specific');
  assert.equal(err.status, 422);
  assert.equal(err.code, 'CUSTOM');
  assert.deepEqual(err.details, { field: 'x' });
});

test('isAppError recognises only errors made by createAppError', () => {
  assert.equal(isAppError(createAppError(400, 'X', 'x')), true);
  assert.equal(isAppError(new Error('plain')), false);
  assert.equal(isAppError({ status: 400, code: 'X', message: 'looks alike' }), false); // shape alone is not enough
  assert.equal(isAppError(null), false);
});

test('notFound and badRequest carry the agreed status and code', () => {
  assert.deepEqual([notFound('city').status, notFound('city').code, notFound('city').message], [404, 'NOT_FOUND', 'city not found']);
  const br = badRequest('AREA_TOO_LARGE', 'too big', { areaSqKm: 31 });
  assert.deepEqual([br.status, br.code, br.details], [400, 'AREA_TOO_LARGE', { areaSqKm: 31 }]);
});
