/**
 * THE single server-side API client (BFF -> AEVORA API). Server-only: route handlers and server components.
 * The session JWT is read from the httpOnly cookie here and never leaves the server.
 */
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { errorKind, isSafeId, type ApiErrorBody } from '@/lib/http';

const API_URL = (process.env.AEVORA_API_URL ?? 'http://localhost:13000').replace(/\/+$/, '');

export type BackendResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiErrorBody };

export interface BackendOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Navigation-state company. Sent as X-Company-Id; the backend decides whether it is allowed. */
  companyId?: string;
  signal?: AbortSignal;
  /** Explicit token (null = anonymous, e.g. login). Defaults to the session cookie. */
  token?: string | null;
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

function failure(status: number, message: string): { ok: false; status: number; error: ApiErrorBody } {
  return { ok: false, status, error: { status, kind: errorKind(status), message } };
}

export async function backendFetch<T>(path: string, opts: BackendOptions = {}): Promise<BackendResult<T>> {
  const token = opts.token !== undefined ? opts.token : await readSessionToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.companyId !== undefined) {
    if (!isSafeId(opts.companyId)) return failure(400, 'Invalid company context');
    headers['X-Company-Id'] = opts.companyId;
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}/${path.replace(/^\/+/, '')}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return failure(503, 'AEVORA backend is unavailable');
  }

  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const m = (data as { message?: unknown } | null)?.message;
    const message = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : res.statusText || 'Request failed';
    return failure(res.status, message);
  }
  return { ok: true, status: res.status, data: data as T };
}
