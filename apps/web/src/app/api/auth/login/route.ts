import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/server/api';
import { isSameOrigin } from '@/server/origin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

/** Exchanges credentials for a backend JWT and stores it ONLY in an httpOnly cookie. The token is never returned. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Cross-origin request rejected' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { identifier?: unknown; password?: unknown } | null;
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!identifier || !password) return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });

  const r = await backendFetch<{ access_token?: unknown }>('auth/login', {
    method: 'POST', body: { actorId: identifier, credential: password }, token: null, signal: req.signal,
  });
  if (!r.ok) {
    const message = r.status === 401 ? 'Invalid credentials' : r.error.message;
    return NextResponse.json({ message }, { status: r.status });
  }
  if (typeof r.data?.access_token !== 'string') return NextResponse.json({ message: 'Unexpected login response' }, { status: 502 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, r.data.access_token, sessionCookieOptions());
  return res;
}
