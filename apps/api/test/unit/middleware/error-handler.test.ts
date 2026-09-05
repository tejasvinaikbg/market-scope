/**
 * Unit tests for the error → HTTP mapping, without a server: a fake `res` records the status and body.
 * This is the contract every client depends on, so it is pinned here as well as through HTTP in app.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../../../src/openapi/zod.ts';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.ts';
import { createAppError } from '../../../src/lib/errors.ts';

function fakeRes() {
  const out: { status?: number; body?: unknown } = {};
  const res = { status(s: number) { out.status = s; return res; }, json(b: unknown) { out.body = b; return res; } };
  return { res, out };
}
const req = { log: { error: () => {} }, originalUrl: '/x' };
const run = (err: unknown) => { const { res, out } = fakeRes(); (errorHandler as Function)(err, req, res, () => {}); return out; };

test('an AppError maps to its own status and code', () => {
  assert.deepEqual(run(createAppError(404, 'NOT_FOUND', 'city not found')), { status: 404, body: { error: { code: 'NOT_FOUND', message: 'city not found', details: undefined } } });
});

test('a ZodError is a 400 with the issues as details', () => {
  const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' });
  const out = run(result.error);
  assert.equal(out.status, 400);
  assert.equal((out.body as any).error.code, 'VALIDATION_ERROR');
  assert.equal((out.body as any).error.details[0].path[0], 'name');
});

test('a malformed JSON body is a 400, and any other error is a 500 without its message', () => {
  assert.equal(run({ type: 'entity.parse.failed' }).status, 400);
  const out = run(new Error('db exploded'));
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } });   // no stack, no 'db exploded'
});

test('notFoundHandler answers with the JSON envelope', () => {
  const { res, out } = fakeRes();
  (notFoundHandler as Function)({}, res, () => {});
  assert.deepEqual(out, { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Route not found' } } });
});
