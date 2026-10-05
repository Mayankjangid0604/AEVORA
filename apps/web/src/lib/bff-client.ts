/** Browser-side fetcher for TanStack Query. Talks only to the same-origin BFF; never sees a JWT. */
import { ApiError, COMPANY_HEADER } from './http';

export function expireSession(): void {
  const next = window.location.pathname + window.location.search;
  // A route handler (not a page) must clear the httpOnly cookie, so this is a full navigation.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/api/auth/logout?next=${encodeURIComponent(next)}`);
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
