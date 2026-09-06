/**
 * Typed fetch wrapper: JSON in/out; the API's error envelope becomes an ApiError carrying its code, status and details.
 * Locally the browser calls `/api/...` and the Next rewrite proxies to the API; deployed, NEXT_PUBLIC_API_URL points the
 * browser at the API's own domain, so the web server is not in the path of every request.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';   // inlined at build time; blank means "same origin, via the rewrite"

/** The full URL for an API path, for the few places that call fetch directly. */
export const apiUrl = (path: string) => `${API_BASE}/api${path}`;

export interface ApiError extends Error { code: string; status: number; details?: unknown }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (res.status === 204) return undefined as T;                     // "done, nothing to say": a delete
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.json().catch(() => null);                       // a proxy error page is not JSON; keep the status text
  const err = new Error(body?.error?.message ?? res.statusText) as ApiError;
  err.code = body?.error?.code ?? 'HTTP_ERROR';
  err.status = res.status;
  err.details = body?.error?.details;                                     // FileIssue[] for a rejected upload
  throw err;
}

/** True for errors made above — the ones whose `code` and `details` a screen can interpret. */
export const isApiError = (err: unknown): err is ApiError => err instanceof Error && 'code' in err && 'status' in err;