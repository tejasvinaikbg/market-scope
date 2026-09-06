/**
 * Outbound HTTP for every third-party service, in one place: a throttle (so the app stays inside a service's rate limit),
 * the identifying headers their usage policies ask for, a timeout, and the rule that decides what is worth retrying.
 * A provider creates one client per service — the throttle lives in the client, so one client is one rate limit — and
 * wraps each operation in `withRetry`.
 */
import pThrottle from 'p-throttle';
import pRetry from 'p-retry';

/** A transient failure (429, 5xx, network error, timeout) is marked so the retry policy can tell it from a final one (4xx). */
export const retryable = (message: string): Error & { retryable: true } => Object.assign(new Error(message), { retryable: true as const });
export const isRetryable = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { retryable?: boolean }).retryable === true;

export interface ThrottledFetchOptions {
  userAgent: string; // who we are, for the service's operators
  minIntervalMs?: number; // at most one request per this many ms through this client (default 1100: just under 1/s)
  timeoutMs?: number; // give up on a single request after this long (default 15 s)
  fetchImpl?: typeof fetch; // tests pass a fake
}

/**
 * A fetch that waits its turn, identifies the app, times out, and classifies the outcome: network errors, 429 and 5xx
 * become retryable errors, any other non-2xx is final, and a 2xx Response is returned for the caller to read.
 * `service` names the service in error messages ("nominatim 429", "overpass 504 from …").
 */
export function createThrottledFetch(opts: ThrottledFetchOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const throttled = pThrottle({ limit: 1, interval: opts.minIntervalMs ?? 1100 })((input: string | URL, init?: RequestInit) =>
    doFetch(input, {
      ...init,
      headers: { 'User-Agent': opts.userAgent, Accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    }),
  );

  return async (service: string, input: string | URL, init?: RequestInit): Promise<Response> => {
    let res: Response;
    try {
      res = await throttled(input, init);
    } catch (err) {
      // each attempt takes its own throttle slot
      throw retryable(`${service} network error: ${(err as Error).message}`);
    }
    if (res.status === 429 || res.status >= 500) throw retryable(`${service} ${res.status}`);
    if (res.status === 406)
      throw new Error(`${service} 406: the server rejected our User-Agent "${opts.userAgent}" — it must be a real contact, not a placeholder`);
    if (!res.ok) throw new Error(`${service} ${res.status}: ${summary(await res.text())}`);
    return res;
  };
}

/** An error body worth putting in a message: the <title> of an HTML page, else the first 300 characters. */
const summary = (body: string): string =>
  body.trimStart().startsWith('<') ? (/<title>(.*?)<\/title>/i.exec(body)?.[1] ?? 'HTML error page') : body.slice(0, 300);

/** The retry policy every provider shares: only retryable errors, doubling waits, and the attempt number for callers that rotate endpoints. */
export const withRetry = <T>(fn: (attempt: number) => Promise<T>, opts: { retries: number; minTimeout: number }): Promise<T> =>
  pRetry(fn, { retries: opts.retries, minTimeout: opts.minTimeout, factor: 2, shouldRetry: ({ error }) => isRetryable(error) });
