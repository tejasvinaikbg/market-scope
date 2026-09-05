/** Typed fetch wrapper: JSON in/out; the API's error envelope becomes an Error carrying its `code` and status. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.json().catch(() => null);
  throw Object.assign(new Error(body?.error?.message ?? res.statusText), { code: body?.error?.code ?? 'HTTP_ERROR', status: res.status });
}
