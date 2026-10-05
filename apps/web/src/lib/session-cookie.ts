/** Session cookie contract. Edge-safe (imported by proxy.ts), holds no secret itself. */

export const SESSION_COOKIE = 'aevora_session';

/** Matches the backend JWT lifetime (`signOptions.expiresIn: '1h'`); no refresh exists. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Request header the proxy sets so server layouts know the path to return to after re-login. */
export const PATH_HEADER = 'x-aevora-path';
