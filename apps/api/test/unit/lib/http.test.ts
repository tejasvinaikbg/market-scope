/** The shared outbound client: identification, classification of outcomes, and the retry policy — with a fake fetch, no network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThrottledFetch, withRetry, retryable, isRetryable } from '../../../src/lib/http.ts';

const fake = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  (async (url: string | URL, init?: RequestInit) => handler(String(url), init)) as unknown as typeof fetch;

test('identifies the app, asks for JSON, and returns a 2xx response', async () => {
  let seen: RequestInit | undefined;
  const request = createThrottledFetch({
    userAgent: 'market-scope/test',
    fetchImpl: fake((_url, init) => {
      seen = init;
      return Response.json({ ok: 1 });
    }),
  });
  const res = await request('svc', 'https://x/');
  assert.deepEqual(await res.json(), { ok: 1 });
  assert.deepEqual((seen?.headers as Record<string, string>)['User-Agent'], 'market-scope/test');
  assert.deepEqual((seen?.headers as Record<string, string>).Accept, 'application/json');
});

test('429, 5xx and network errors are retryable; other failures are final and carry the body', async () => {
  const codes = async (status: number) => {
    try {
      await createThrottledFetch({ userAgent: 't', fetchImpl: fake(() => new Response('body', { status })) })('svc', 'https://x/');
    } catch (err) {
      return err as Error;
    }
  };
  assert.equal(isRetryable(await codes(429)), true);
  assert.equal(isRetryable(await codes(503)), true);
  const final = await codes(400);
  assert.equal(isRetryable(final), false);
  assert.equal(final?.message, 'svc 400: body');
  const network = createThrottledFetch({
    userAgent: 't',
    fetchImpl: fake(() => {
      throw new Error('ECONNRESET');
    }),
  });
  await assert.rejects(network('svc', 'https://x/'), (err: Error) => isRetryable(err) && /svc network error: ECONNRESET/.test(err.message));
});

test('a 406 says the User-Agent was rejected; an HTML error body becomes its title', async () => {
  const at = (status: number, body: string) =>
    createThrottledFetch({ userAgent: 'x/1 (you@example.com)', fetchImpl: fake(() => new Response(body, { status })) })('overpass', 'https://x/');
  await assert.rejects(at(406, '<html><title>406 Not Acceptable</title></html>'), /rejected our User-Agent "x\/1 \(you@example\.com\)"/);
  await assert.rejects(at(403, '<html><head><title>403 Forbidden</title></head></html>'), /^Error: overpass 403: 403 Forbidden$/);
});

test('withRetry retries only retryable errors, passing the attempt number', async () => {
  const attempts: number[] = [];
  const out = await withRetry(
    async (attempt) => {
      attempts.push(attempt);
      if (attempt < 3) throw retryable('busy');
      return 'done';
    },
    { retries: 3, minTimeout: 1 },
  );
  assert.deepEqual([out, attempts], ['done', [1, 2, 3]]);
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error('final');
      },
      { retries: 3, minTimeout: 1 },
    ),
    /final/,
  );
  assert.equal(calls, 1);
});
