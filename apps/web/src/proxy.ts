import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER, SESSION_COOKIE } from '@/lib/session-cookie';
import { safeNextPath } from '@/lib/http';

/**
 * Coarse gate only: presence of the session cookie. Validity is decided by the backend on every request
 * An invalid cookie leads to /login?reason=expired, which always renders (no redirect loop); the cookie is
 * cleared by same-origin BFF 401 responses or overwritten by the next sign-in.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname === '/login') {
    if (hasSession && req.nextUrl.searchParams.get('reason') !== 'expired') return NextResponse.redirect(new URL(safeNextPath(req.nextUrl.searchParams.get('next')), req.url));
    return NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL('/login', req.url);
    const next = safeNextPath(pathname + search);
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api/|_next/|favicon.ico).*)'] };
