import type { NextRequest } from 'next/server';

/** CSRF defence in depth (cookie is already SameSite=Strict): state-changing BFF calls must be same-origin. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  if (origin === req.nextUrl.origin) return true;

  const host = req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(/:$/, '');
    if (origin === `${proto}://${host}`) return true;
  }

  const normalizeLoopback = (urlStr: string) => urlStr.replace('//127.0.0.1:', '//localhost:');
  return normalizeLoopback(origin) === normalizeLoopback(req.nextUrl.origin);
}
