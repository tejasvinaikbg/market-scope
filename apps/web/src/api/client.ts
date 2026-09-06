/** Typed fetch wrapper: JSON in/out; the API's error envelope becomes an Error carrying its `code` and status. */

export interface ApiError extends Error { code: string; status: number; details?: unknown }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.json().catch(() => null);
  const err = new Error(body?.error?.message ?? res.statusText) as ApiError;
  err.code = body?.error?.code ?? 'HTTP_ERROR'
  err.status = res.status
  err.details = body?.error?.details
  throw err
}

export const isApiError = (err: unknown): err is ApiError => err instanceof Error && 'code' in err && 'status' in err;
