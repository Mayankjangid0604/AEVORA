import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { POST as submit } from '@/app/api/public/request/route';
import { POST as status } from '@/app/api/public/request/status/route';
import { GET as bffGet, POST as bffPost } from '@/app/api/bff/[...path]/route';
import { proxy } from '@/proxy';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { intakeErrors, type IntakeForm } from '@/lib/intake';

// Mocked backend: these tests cover the BFF/proxy layer only, not persistence.
const ORIGIN = 'http://localhost:3000';
const fetchMock = vi.fn();
const reply = (s: number, b: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }));
const req = (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`${ORIGIN}${url}`, { method: init.method ?? 'GET', body: init.body, headers: { 'content-type': 'application/json', ...init.headers } });
const params = (p: string) => ({ params: Promise.resolve({ path: p.split('/') }) });
const valid: IntakeForm = { businessName: 'Sharma Sweets', contactName: 'Asha', email: 'asha@sharma.test', phone: '', service: 'WEBSITE', description: 'We need a simple website with our menu and opening hours.', website: '' };

beforeEach(() => { jar.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('public request page access', () => {
  it('/request is reachable without a session; operator pages still require one', () => {
    expect(proxy(new NextRequest(`${ORIGIN}/request`)).headers.get('location')).toBeNull();
    expect(proxy(new NextRequest(`${ORIGIN}/company/c1/requests`)).headers.get('location')).toContain('/login');
  });
});

describe('POST /api/public/request', () => {
  it('rejects cross-origin and oversized bodies without calling the backend', async () => {
    expect((await submit(req('/api/public/request', { method: 'POST', body: JSON.stringify(valid), headers: { origin: 'https://evil.test' } }))).status).toBe(403);
    expect((await submit(req('/api/public/request', { method: 'POST', body: 'x'.repeat(17_000), headers: { origin: ORIGIN } }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is anonymous even with a session cookie, forwards only known fields, returns only reference/status/message', async () => {
    jar.set(SESSION_COOKIE, 'operator-jwt');
    reply(201, { reference: 'REQ-ABCDEFGHJK', status: 'RECEIVED', message: 'Thanks', id: 'row-id', companyId: 'tenant' });
    const res = await submit(req('/api/public/request', { method: 'POST', body: JSON.stringify({ ...valid, companyId: 'evil', status: 'CONVERTED' }), headers: { origin: ORIGIN } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reference: 'REQ-ABCDEFGHJK', status: 'RECEIVED', message: 'Thanks' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/public/requests');
    expect(init.headers.Authorization).toBeUndefined();
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['businessName', 'contactName', 'description', 'email', 'phone', 'service', 'website']);
  });

  it('passes backend validation errors through', async () => {
    reply(400, { message: 'Please correct the highlighted fields.' });
    const res = await submit(req('/api/public/request', { method: 'POST', body: JSON.stringify(valid), headers: { origin: ORIGIN } }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/public/request/status', () => {
  it('malformed reference: 404 without a backend call; valid lookup sends the email in the body, never the URL', async () => {
    expect((await status(req('/api/public/request/status', { method: 'POST', body: JSON.stringify({ reference: 'abc', email: 'a@b.test' }), headers: { origin: ORIGIN } }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    reply(200, { reference: 'REQ-ABCDEFGHJK', status: 'IN_REVIEW', submittedAt: '2026-10-13T00:00:00Z', internalNotes: 'secret' });
    const res = await status(req('/api/public/request/status', { method: 'POST', body: JSON.stringify({ reference: 'req-abcdefghjk', email: 'asha@sharma.test' }), headers: { origin: ORIGIN } }));
    expect(await res.json()).toEqual({ reference: 'REQ-ABCDEFGHJK', status: 'IN_REVIEW', submittedAt: '2026-10-13T00:00:00Z' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/public/requests/status');
    expect(url).not.toContain('asha');
    expect(JSON.parse(init.body)).toEqual({ reference: 'REQ-ABCDEFGHJK', email: 'asha@sharma.test' });
  });
});

describe('operator queue BFF', () => {
  const H = { 'x-aevora-company': 'c1', origin: ORIGIN };
  beforeEach(() => jar.set(SESSION_COOKIE, 'operator-jwt'));

  it('GET inquiries needs an explicit company and projects operator fields only', async () => {
    expect((await bffGet(req('/api/bff/inquiries'), params('inquiries'))).status).toBe(400);
    reply(200, [{ id: 'i1', publicRef: 'REQ-ABCDEFGHJK', status: 'NEW', title: 't', description: 'd', companyId: 'c1', submissionHash: 'h' }]);
    const body = await (await bffGet(req('/api/bff/inquiries', { headers: H }), params('inquiries'))).json();
    expect(body[0]).toMatchObject({ id: 'i1', reference: 'REQ-ABCDEFGHJK', status: 'NEW' });
    expect(body[0]).not.toHaveProperty('companyId');
    expect(body[0]).not.toHaveProperty('submissionHash');
  });

  it('POST mutations: same-origin, explicit company, allow-listed paths and fields only', async () => {
    expect((await bffPost(req('/api/bff/inquiries/i1/transition', { method: 'POST', body: '{}', headers: { ...H, origin: 'https://evil.test' } }), params('inquiries/i1/transition'))).status).toBe(403);
    expect((await bffPost(req('/api/bff/job/j1/delete', { method: 'POST', body: '{}', headers: H }), params('job/j1/delete'))).status).toBe(404);
    expect((await bffPost(req('/api/bff/inquiries/i1/transition', { method: 'POST', body: '{}', headers: { origin: ORIGIN } }), params('inquiries/i1/transition'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    reply(201, { id: 'i1', status: 'UNDER_REVIEW', title: 't', description: 'd' });
    const res = await bffPost(req('/api/bff/inquiries/i1/transition', { method: 'POST', body: JSON.stringify({ from: 'NEW', to: 'UNDER_REVIEW', companyId: 'evil' }), headers: H }), params('inquiries/i1/transition'));
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:13000/inquiries/i1/transition');
    expect(JSON.parse(init.body)).toEqual({ from: 'NEW', to: 'UNDER_REVIEW' });
    expect(init.headers.Authorization).toBe('Bearer operator-jwt');
  });

  it('job controls: only pause/resume/replay are forwarded, with an empty body', async () => {
    reply(201, { id: 'j1', type: 'TASK_EXECUTION', status: 'PAUSED', payload: { secret: 1 } });
    const res = await bffPost(req('/api/bff/job/j1/pause', { method: 'POST', body: JSON.stringify({ status: 'COMPLETED' }), headers: H }), params('job/j1/pause'));
    const body = await res.json();
    expect(body).toMatchObject({ id: 'j1', status: 'PAUSED' });
    expect(body).not.toHaveProperty('payload');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({});
  });
});

describe('client-side intake rules (mirror of the API)', () => {
  it('accepts a valid form and flags each invalid field', () => {
    expect(intakeErrors(valid)).toEqual({});
    const e = intakeErrors({ ...valid, businessName: 'x', email: 'nope', phone: 'abc', service: 'HACK', description: 'short' });
    expect(Object.keys(e).sort()).toEqual(['businessName', 'description', 'email', 'phone', 'service']);
    expect(intakeErrors({ ...valid, description: 'see https://a.test https://b.test https://c.test https://d.test for details' }).description).toMatch(/3 links/);
  });
});
