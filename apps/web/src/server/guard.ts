import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PATH_HEADER } from '@/lib/session-cookie';
import type { BackendResult } from './api';

/** One place that turns a backend 401 into "clear session -> /login" (server components cannot clear cookies). */
export async function redirectIfUnauthenticated(r: BackendResult<unknown>): Promise<void> {
  if (r.ok || r.status !== 401) return;
  const path = (await headers()).get(PATH_HEADER) ?? '/';
  redirect(`/api/auth/logout?next=${encodeURIComponent(path)}`);
}
