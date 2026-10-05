import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PATH_HEADER } from '@/lib/session-cookie';
import { expiredLoginPath } from '@/lib/http';
import type { BackendResult } from './api';

/**
 * One place that turns a backend 401 into "go to /login". Nothing is cleared on this GET path (no CSRF-able
 * state change): /login?reason=expired always renders, and the next sign-in overwrites the dead cookie.
 */
export async function redirectIfUnauthenticated(r: BackendResult<unknown>): Promise<void> {
  if (r.ok || r.status !== 401) return;
  redirect(expiredLoginPath((await headers()).get(PATH_HEADER) ?? '/'));
}
