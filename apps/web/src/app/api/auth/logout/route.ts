import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/server/origin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';
import { safeNextPath } from '@/lib/http';

/**
 * Clears the local session cookie. The backend has no token revocation: an already-issued JWT stays
 * valid until its 1 h expiry, but this browser no longer holds it.
 */
function cleared(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Cross-origin request rejected' }, { status: 403 });
  return cleared(NextResponse.json({ ok: true }));
}

/** Expired/invalid session path: server layouts and the client redirect here; it clears and sends to /login once. */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get('next'));
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('reason', 'expired');
  if (next !== '/') url.searchParams.set('next', next);
  return cleared(NextResponse.redirect(url, 303));
}
