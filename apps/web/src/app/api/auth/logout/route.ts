import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/server/origin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

/**
 * POST-only: clears the local session cookie. There is deliberately no GET handler, so no cross-site
 * navigation can change session state. The backend has no token revocation: an issued JWT stays valid
 * until its 1 h expiry, but this browser no longer holds it.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Cross-origin request rejected' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
