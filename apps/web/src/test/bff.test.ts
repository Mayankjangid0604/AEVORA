import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session cookie jar seen by next/headers cookies() inside server code.
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { POST as login } from '@/app/api/auth/login/route';
import { GET as logoutGet, POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as bff } from '@/app/api/bff/[...path]/route';
import { backendFetch } from '@/server/api';
import { proxy } from '@/proxy';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { safeNextPath, isSafeId, errorKind } from '@/lib/http';

const ORIGIN = 'http://localhost:3000';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJhY3RvcklkIjoiY2hhaXItQSJ9.sig';
const fetchMock = vi.fn();

function backendReply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}
const post = (url: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  new NextRequest(`${ORIGIN}${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const bffCall = (path: string, headers: Record<string, string> = {}) =>
  bff(new NextRequest(`${ORIGIN}/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('?')[0]!.split('/') }) });

beforeEach(() => { jar.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('login', () => {
  it('success: sets an httpOnly SameSite=Strict session cookie and never returns the JWT', async () => {
    backendReply(201, { access_token: JWT });
    const res = await login(post('/api/auth/login', { identifier: 'a@test.local', password: 'pw' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=${JWT}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=strict/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=3600/);
    expect(await res.text()).not.toContain(JWT);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/auth/login');
    expect(JSON.parse(init.body)).toEqual({ actorId: 'a@test.local', credential: 'pw' });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('invalid credentials: 401, no cookie', async () => {
    backendReply(401, { message: 'Invalid credentials' });
    const res = await login(post('/api/auth/login', { identifier: 'a', password: 'bad' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('missing fields: 400 without calling the backend', async () => {
    const res = await login(post('/api/auth/login', { identifier: '' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cross-origin / origin-less login is rejected', async () => {
    expect((await login(post('/api/auth/login', { identifier: 'a', password: 'b' }, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await login(post('/api/auth/login', { identifier: 'a', password: 'b' }, {}))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backend down: 503 and no cookie', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await login(post('/api/auth/login', { identifier: 'a', password: 'b' }));
    expect(res.status).toBe(503);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('logout', () => {
  it('POST clears the cookie', async () => {
    const res = await logoutPost(post('/api/auth/logout', {}));
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, 'i'));
  });
  it('POST cross-origin or origin-less logout is rejected and leaves the cookie alone', async () => {
    for (const headers of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
      const res = await logoutPost(post('/api/auth/logout', {}, headers));
      expect(res.status).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });
  it('GET (expired session) clears the cookie and redirects once to /login with a safe next', async () => {
    const res = await logoutGet(new NextRequest(`${ORIGIN}/api/auth/logout?next=%2Fcompany%2FA`));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?reason=expired&next=%2Fcompany%2FA`);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });
  it('GET drops an unsafe next (open redirect)', async () => {
    const res = await logoutGet(new NextRequest(`${ORIGIN}/api/auth/logout?next=%2F%2Fevil.example`));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?reason=expired`);
  });
});

describe('BFF proxy', () => {
  it('no session: 401 without calling the backend', async () => {
    expect((await bffCall('auth/me')).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('routes outside the verified allowlist are 404 (blocked domains are unreachable)', async () => {
    jar.set(SESSION_COOKIE, JWT);
    for (const p of ['tasks/t1', 'operating-loop/A/dashboard', 'continuous-improvement/company/A/proposals', 'companies', 'chairman/overview']) {
      expect((await bffCall(p)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('attaches Bearer + X-Company-Id server-side and preserves the backend status', async () => {
    jar.set(SESSION_COOKIE, JWT);
    backendReply(403, { message: 'Unauthorized company context access' });
    const res = await bffCall('companies/B', { 'x-aevora-company': 'B' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ kind: 'forbidden' });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.headers.Authorization).toBe(`Bearer ${JWT}`);
    expect(init.headers['X-Company-Id']).toBe('B');
  });
  it('rejects a malformed company context before reaching the backend', async () => {
    jar.set(SESSION_COOKIE, JWT);
    expect((await bffCall('auth/me', { 'x-aevora-company': '../B;x=1' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('backend 401 (expired JWT) clears the session cookie', async () => {
    jar.set(SESSION_COOKIE, JWT);
    backendReply(401, { message: 'Invalid or expired authentication token' });
    const res = await bffCall('auth/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });
  it('success responses never echo the JWT', async () => {
    jar.set(SESSION_COOKIE, JWT);
    backendReply(200, [{ id: 'A', name: 'Alpha', status: 'ACTIVE', groupId: null }]);
    const res = await bffCall('auth/companies');
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(JWT);
  });
});

describe('backendFetch error normalisation', () => {
  it.each([[400, 'validation'], [401, 'unauthenticated'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [422, 'validation'], [500, 'error']])(
    '%i -> %s', async (status, kind) => {
      backendReply(status, { message: ['a', 'b'] });
      const r = await backendFetch('x', { token: 't' });
      expect(r).toEqual({ ok: false, status, error: { status, kind, message: 'a; b' } });
    });
  it('supports cancellation', async () => {
    fetchMock.mockImplementationOnce((_u, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const ac = new AbortController();
    const p = backendFetch('x', { token: 't', signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('route protection (proxy)', () => {
  const visit = (path: string, cookie?: string) =>
    proxy(new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));

  it('unauthenticated protected route -> /login with return path', () => {
    const res = visit('/company/A/ceo');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fcompany%2FA%2Fceo`);
  });
  it('login page is public without a session', () => {
    expect(visit('/login').headers.get('location')).toBeNull();
  });
  it('authenticated user on /login goes to a safe next, never to an external URL', () => {
    expect(visit('/login?next=%2Fdecisions', JWT).headers.get('location')).toBe(`${ORIGIN}/decisions`);
    expect(visit('/login?next=https%3A%2F%2Fevil.example', JWT).headers.get('location')).toBe(`${ORIGIN}/`);
  });
  it('authenticated request passes through', () => {
    expect(visit('/', JWT).headers.get('location')).toBeNull();
  });
});

describe('shared helpers', () => {
  it('safeNextPath', () => {
    expect(safeNextPath('/company/A')).toBe('/company/A');
    for (const bad of ['//evil', 'https://evil', '/\\evil', '/login', '/login?next=/x', '/api/bff/x', undefined, 5]) expect(safeNextPath(bad)).toBe('/');
  });
  it('isSafeId', () => {
    expect(isSafeId('00000000-0000-4000-8000-000000000000')).toBe(true);
    for (const bad of ['', '../x', 'a/b', 'a b', 'x'.repeat(65), null]) expect(isSafeId(bad)).toBe(false);
  });
  it('errorKind', () => expect(errorKind(503)).toBe('unavailable'));
});
