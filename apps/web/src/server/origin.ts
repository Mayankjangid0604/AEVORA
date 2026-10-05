import type { NextRequest } from 'next/server';

/** CSRF defence in depth (cookie is already SameSite=Strict): state-changing BFF calls must be same-origin. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === req.nextUrl.origin;
}
