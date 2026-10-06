import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NextRequest } from 'next/server';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { GET as bff } from '@/app/api/bff/[...path]/route';
import { projections } from '@/server/projections';
import { MarketingWorkspace, SalesWorkspace, filterLeads } from '@/components/growth-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { COMPANY_DOMAINS } from '@/lib/domains';

const post = (id: string, companyId = 'A') => ({
  id, companyId, createdByEmployeeId: 'EMP-SECRET', platform: 'INSTAGRAM', contentType: 'TIP', caption: `Caption ${id}\nmore`, hashtags: ['#web'],
  imagePrompt: 'PROMPT-SECRET', imageDescription: 'x', status: 'APPROVED', scheduledFor: null, postedAt: null, weekNumber: 40, year: 2026,
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
});
const lead = (id: string, status = 'NEW', companyId = 'A') => ({
  id, companyId, name: `Biz ${id}`, organizationName: null, contactName: 'CONTACT-NAME-SECRET', contactRole: null, contactEmail: 'mail@secret.test',
  contactPhone: '+91-99999-SECRET', source: 'GOOGLE_PLACES', industry: 'Dental', geography: 'Pune', companySize: null, status, assignedToId: null,
  notes: 'NOTES-SECRET', metadata: { raw: 'META-SECRET' }, googlePlaceId: 'PLACE-SECRET', website: 'https://site.secret', qualityScore: 87,
  lastContactedAt: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
});
const run = (id: string, companyId = 'A') => ({ id, companyId, status: 'FAILED', triggeredBy: 'SCHEDULE', error: 'ERROR-SECRET stack', triggeredAt: '2026-10-01T10:00:00.000Z', completedAt: null, totalFound: 12, totalNew: 3 });
const LEAK = /SECRET|qualityScore|companyId|imagePrompt|contactEmail|"notes"|"metadata"|"error"/;

describe('slice 8 projections', () => {
  it('posts, runs and leads keep display fields only and only the selected company', () => {
    const p = projections.contentPosts([post('p1'), post('p2', 'B')], 'A');
    const r = projections.leadGenRuns([run('r1'), run('r2', 'B')], 'A');
    const l = projections.salesLeads([lead('l1'), lead('l2', 'NEW', 'B'), { id: 'bad' }], 'A');
    expect([p, r, l].map((x) => x.map((y) => y.id))).toEqual([['p1'], ['r1'], ['l1']]);
    expect(l[0]).toEqual({ id: 'l1', name: 'Biz l1', industry: 'Dental', geography: 'Pune', companySize: null, status: 'NEW', source: 'GOOGLE_PLACES', createdAt: '2026-10-01T10:00:00.000Z', lastContactedAt: null });
    expect(JSON.stringify([p, r, l])).not.toMatch(LEAK);
  });
  it('lead status filter', () => {
    const rows = projections.salesLeads([lead('a', 'NEW'), lead('b', 'CONTACTED')], 'A');
    expect(filterLeads(rows, 'CONTACTED').map((x) => x.id)).toEqual(['b']);
    expect(filterLeads(rows, '')).toHaveLength(2);
  });
});

describe('slice 8 BFF routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['marketing-content/posts', 'lead-gen/runs', 'lead-gen/leads'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('leads forward X-Company-Id; foreign rows and contact data never reach the browser', async () => {
    reply(200, [lead('l1'), lead('l9', 'NEW', 'B')]);
    const res = await call('lead-gen/leads', { 'x-aevora-company': 'A' });
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    const text = await res.text();
    expect(text).not.toMatch(LEAK);
    expect(text).not.toContain('l9');
  });
  it.each([[401], [403]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('marketing-content/posts', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'marketing-content/posts/generate', 'marketing-content/posts/p1/approve', 'marketing-content/posts/p1/posted', 'marketing-content/whatsapp/broadcast',
    'marketing-content/pixel/run', 'marketing-content/calendars/generate', 'marketing-content/calendars', 'marketing/campaigns', 'marketing/content/c1/publish',
    'marketing/analytics/optimization', 'lead-gen/trigger', 'sales/leads', 'sales/leads/l1', 'sales/leads/l1/convert', 'sales/opportunities',
    'outreach/drafts', 'outreach/drafts/d1/approve', 'outreach/process', 'outreach/whatsapp/l1', 'outreach/campaigns', 'outreach/inbound/poll-email',
    'inbox/messages', 'inbox/check', 'client-meeting/request', 'chairman/research/proposals', 'chairman/research/inference', 'research/r1', 'research/r1/start',
    'marketing/research', 'lead-gen/leads/l1',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('slice 8 rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:1')), retry: false });

  it('Marketing: AI provenance, status verbatim, no publish controls; empty and 403 states', async () => {
    const qc = client();
    qc.setQueryData(companyKeys.growth('A', 'posts'), projections.contentPosts([post('p1')], 'A'));
    const html = render(qc, <MarketingWorkspace companyId="A" />);
    for (const s of ['AI-generated (PIXEL)', 'APPROVED', 'Caption p1', '#web']) expect(html).toContain(s);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/conversion rate|engagement|reach|ROI/i);
    const empty = client();
    empty.setQueryData(companyKeys.growth('A', 'posts'), []);
    expect(render(empty, <MarketingWorkspace companyId="A" />)).toContain('No content posts');
    const denied = client();
    await fail(denied, companyKeys.growth('A', 'posts'), 403);
    const d = render(denied, <MarketingWorkspace companyId="A" />);
    expect(d).toContain('Access denied');
    expect(d).not.toContain('stack.ts');
  });
  it('Sales: runs and leads, no contact data, "no contact recorded" instead of implying outreach', () => {
    const qc = client();
    qc.setQueryData(companyKeys.growth('A', 'lead-runs'), projections.leadGenRuns([run('r1')], 'A'));
    qc.setQueryData(companyKeys.growth('A', 'leads'), projections.salesLeads([lead('l1')], 'A'));
    const html = render(qc, <SalesWorkspace companyId="A" />);
    for (const s of ['FAILED', 'SCHEDULE', '>12<', 'Biz l1', 'Dental · Pune', 'GOOGLE_PLACES', 'no contact recorded']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
    expect(html).not.toContain('<button');
  });
  it('Sales loading and error states', async () => {
    expect(render(client(), <SalesWorkspace companyId="A" />)).toContain('Loading');
    const qc = client();
    await fail(qc, companyKeys.growth('A', 'leads'), 503);
    qc.setQueryData(companyKeys.growth('A', 'lead-runs'), []);
    const html = render(qc, <SalesWorkspace companyId="A" />);
    expect(html).toContain('Backend unavailable');
    expect(html).toContain('No runs');
  });
  it('registry: marketing and sales ready; research removed (no data, no placeholder); keys partitioned', () => {
    expect(COMPANY_DOMAINS.find((d) => d.slug === 'marketing')?.status).toBe('ready');
    expect(COMPANY_DOMAINS.find((d) => d.slug === 'sales')?.status).toBe('ready');
    expect(COMPANY_DOMAINS.map((d) => d.slug)).not.toContain('research');
    expect(companyKeys.growth('A', 'leads')).not.toEqual(companyKeys.growth('B', 'leads'));
  });
});
