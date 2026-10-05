/** Browser-side fetcher for TanStack Query. Talks only to the same-origin BFF; never sees a JWT. */
import { ApiError, COMPANY_HEADER, expiredLoginPath } from './http';

/** The BFF already cleared the cookie on its 401 response; full navigation drops all client state. */
export function expireSession(): void {
  window.location.assign(expiredLoginPath(window.location.pathname + window.location.search));
}

export async function bffGet<T>(path: string, opts: { companyId?: string; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api/bff/${path.replace(/^\/+/, '')}`, {
    headers: opts.companyId ? { [COMPANY_HEADER]: opts.companyId } : {},
    signal: opts.signal,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  if (res.status === 401) expireSession();
  if (!res.ok) throw new ApiError(res.status, body?.message ?? res.statusText);
  return body as T;
}
