/** The API client: a 2xx is parsed, an error envelope becomes an ApiError with its code, status and details, and a non-JSON failure still has a message. */
import { api, isApiError } from '@/api/client';

const reply = (status: number, body: unknown, json = true) =>
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status < 400,
    status,
    statusText: `status ${status}`,
    json: async () => {
      if (!json) throw new Error('not json');
      return body;
    },
  } as Response);

test('a 2xx returns the parsed body, and the request goes to /api', async () => {
  const spy = reply(200, { hello: 'world' });
  expect(await api<{ hello: string }>('/things')).toEqual({ hello: 'world' });
  expect(spy).toHaveBeenCalledWith('/api/things', undefined);
});

test('an error envelope becomes an ApiError carrying code, status and details', async () => {
  reply(400, { error: { code: 'INVALID_HEADERS', message: 'Header row is invalid', details: [{ column: 'city', message: 'missing' }] } });
  const err = await api('/portfolios').catch((e: unknown) => e);
  expect(isApiError(err)).toBe(true);
  if (!isApiError(err)) throw new Error('unreachable');
  expect([err.code, err.status, err.message]).toEqual(['INVALID_HEADERS', 400, 'Header row is invalid']);
  expect(err.details).toEqual([{ column: 'city', message: 'missing' }]);
});

test('a failure that is not JSON (a proxy error page) still becomes an ApiError with the status text', async () => {
  reply(502, null, false);
  const err = await api('/markets').catch((e: unknown) => e);
  expect(isApiError(err)).toBe(true);
  if (!isApiError(err)) throw new Error('unreachable');
  expect([err.code, err.status, err.message]).toEqual(['HTTP_ERROR', 502, 'status 502']);
});

test('isApiError rejects plain errors, so a network failure is told apart from an answer', () => {
  expect(isApiError(new TypeError('Failed to fetch'))).toBe(false);
  expect(isApiError(null)).toBe(false);
});

test('a 204 answers with nothing, and no body is read', async () => {
  const json = jest.fn();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 204, statusText: '204', json } as unknown as Response);
  await expect(api('/markets/7', { method: 'DELETE' })).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});
