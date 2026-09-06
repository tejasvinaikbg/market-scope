/** Test helpers: render inside the real Providers, and answer fetch from a table of routes instead of a server. */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';

export const renderApp = (ui: ReactNode) => render(<Providers>{ui}</Providers>);

type Reply = { status?: number; body: unknown };

/** fetch answers from the table, keyed "METHOD url"; a request with no entry fails the test loudly. */
export function mockApi(routes: Record<string, Reply>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const reply = routes[key];
    if (!reply) throw new Error(`no mock for ${key}`);
    const status = reply.status ?? 200;
    // The shape api() reads; jsdom has no Response class, and the wrapper needs nothing more than this.
    return { ok: status < 400, status, statusText: `${status}`, json: async () => reply.body } as Response;
  });
}