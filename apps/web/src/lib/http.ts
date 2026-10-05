/** Shared (client + server) HTTP vocabulary. Contains no secrets and no authority. */

export type ErrorKind =
  | 'unauthenticated' // 401: no/expired session
  | 'forbidden'       // 403: authenticated, not permitted
  | 'not_found'       // 404
  | 'conflict'        // 409: stale/conflicting state
  | 'validation'      // 400/422
  | 'unavailable'     // network failure / 502-504
  | 'error';

export function errorKind(status: number): ErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  return 'error';
}

export interface ApiErrorBody { status: number; kind: ErrorKind; message: string }

export class ApiError extends Error {
  readonly kind: ErrorKind;
  constructor(readonly status: number, message: string) {
    super(message);
    this.kind = errorKind(status);
  }
}

/** Backend ids are uuids or short slugs; anything else is never forwarded (header/path injection guard). */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Post-login return path: same-origin absolute path only, never back into auth/api routes. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  if (/^\/(login|api)(\/|\?|$)/.test(raw)) return '/';
  return raw;
}

/** Browser -> BFF header carrying the navigation-state company (the BFF forwards it as X-Company-Id). */
export const COMPANY_HEADER = 'x-aevora-company';
