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
import { AttentionWorkspace, CeoWorkspace, DecisionsWorkspace } from '@/components/ceo-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { COMPANY_DOMAINS, OS_DOMAINS } from '@/lib/domains';

const question = (id: string, status: string, companyId = 'A') => ({
  id, companyId, ceoReviewId: 'r1', question: `Q ${id}?`, context: { secret: 'CONTEXT-SECRET' }, urgency: 'HIGH', status,
  askedAt: '2026-10-01T10:00:00.000Z', answeredAt: status === 'OPEN' ? null : '2026-10-02T10:00:00.000Z',
  chairmanAnswer: status === 'OPEN' ? null : 'Yes, go ahead', usedAt: null,
});
const decision = (id: string, companyId = 'A') => ({
  id, companyId, type: 'HIRE', title: `Hire ${id}`, description: 'Need an analyst', proposerId: 'e1', targetEmployeeId: null,
  payload: { salary: 'PAYLOAD-SECRET' }, status: 'APPROVED', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z',
  approvedBy: 'APPROVER-ACTOR-SECRET', approvedAt: '2026-10-02T10:00:00.000Z', proposer: { id: 'e1', name: 'Ceo Agent' }, targetEmployee: null,
});
const alert = (id: string, companyId = 'A') => ({
  id, companyId, severity: 'WARNING', category: 'finance', title: `Alert ${id}`, description: null, relatedEntityId: 'REL-SECRET',
  status: 'ACTIVE', createdAt: '2026-10-01T10:00:00.000Z', acknowledgedAt: null, resolvedAt: null,
});
const LEAK = /CONTEXT-SECRET|PAYLOAD-SECRET|APPROVER-ACTOR-SECRET|REL-SECRET|companyId|approvedBy|"payload"|"context"/;

describe('slice 7 projections', () => {
  it('questions drop context JSON and rows of other companies', () => {
    const out = projections.ceoQuestions([question('q1', 'OPEN'), question('q2', 'OPEN', 'B')], 'A');
    expect(out.map((q) => q.id)).toEqual(['q1']);
    expect(JSON.stringify(out)).not.toMatch(LEAK);
  });
  it('decisions drop payload and approver id; alerts drop related entity; foreign rows dropped', () => {
    const d = projections.decisions([decision('d1'), decision('d2', 'B')], 'A');
    expect(d.map((x) => x.id)).toEqual(['d1']);
    expect(d[0]).toMatchObject({ status: 'APPROVED', proposer: { name: 'Ceo Agent' }, approvedAt: '2026-10-02T10:00:00.000Z' });
    const a = projections.alerts([alert('a1'), alert('a2', 'B')], 'A');
    expect(a.map((x) => x.id)).toEqual(['a1']);
    expect(JSON.stringify([d, a])).not.toMatch(LEAK);
  });
  it('feed keeps backend fields verbatim and drops malformed rows', () => {
    const f = projections.ceoFeed([{ id: 'r1', at: '2026-10-01T10:00:00.000Z', kind: 'REVIEW', title: 'Business review', detail: 'x', extra: 'X' }, { id: 'bad' }]);
    expect(f).toEqual([{ id: 'r1', at: '2026-10-01T10:00:00.000Z', kind: 'REVIEW', outcome: null, title: 'Business review', detail: 'x' }]);
  });
});

describe('slice 7 BFF routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['ceo/feed', 'ceo/questions', 'chairman/decisions', 'chairman/alerts'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('questions forward X-Company-Id and return the projection only', async () => {
    reply(200, [question('q1', 'OPEN'), question('q9', 'OPEN', 'B')]);
    const res = await call('ceo/questions', { 'x-aevora-company': 'A' });
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    const text = await res.text();
    expect(text).not.toMatch(LEAK);
    expect(text).not.toContain('q9');
  });
  it.each([[401], [403]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('chairman/decisions', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'ceo/ask', 'ceo/reviews/run', 'ceo/questions/q1/answer', 'ceo/autonomous-decisions', 'ceo/autonomous-decisions/x/execute',
    'ceo/autonomous-decisions/x/approve', 'ceo/notify-test', 'ceo/weekly-reports/run', 'ceo/reviews', 'ceo/operating-state', 'ceo/delegate',
    'chairman/decisions/d1/approve', 'chairman/decisions/d1/reject', 'chairman/alerts/a1/read', 'chairman/alerts/a1/resolve',
    'autonomous-enterprise/decisions', 'autonomous-enterprise/escalations',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('slice 7 rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:1')), retry: false });

  it('CEO: AI provenance, verbatim outcome, human answer labelled, no actions', () => {
    const qc = client();
    qc.setQueryData(companyKeys.ceo('A', 'feed'), projections.ceoFeed([{ id: 'r1:0', at: '2026-10-01T10:00:00.000Z', kind: 'PIPELINE', outcome: 'PROPOSED', title: 'Follow up lead', detail: 'Why: stale' }]));
    qc.setQueryData(companyKeys.ceo('A', 'questions'), projections.ceoQuestions([question('q1', 'ANSWERED')], 'A'));
    const html = render(qc, <CeoWorkspace companyId="A" />);
    for (const s of ['AI CEO', 'recorded outcome: PROPOSED', 'Follow up lead', 'Asked by AI CEO', 'Chairman&#x27;s answer (human)', 'Yes, go ahead']) expect(html).toContain(s);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/executed|score|confidence/i);
  });
  it('Decisions: status verbatim, proposer, no approve/reject controls; empty and 403 states', async () => {
    const qc = client();
    qc.setQueryData(companyKeys.chairman('A', 'decisions'), projections.decisions([decision('d1')], 'A'));
    const html = render(qc, <DecisionsWorkspace companyId="A" />);
    for (const s of ['Hire d1', 'APPROVED', 'Ceo Agent', 'Need an analyst']) expect(html).toContain(s);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(LEAK);
    const empty = client();
    empty.setQueryData(companyKeys.chairman('A', 'decisions'), []);
    expect(render(empty, <DecisionsWorkspace companyId="A" />)).toContain('No decisions');
    const denied = client();
    await fail(denied, companyKeys.chairman('A', 'decisions'), 403);
    const d = render(denied, <DecisionsWorkspace companyId="A" />);
    expect(d).toContain('Access denied');
    expect(d).not.toContain('stack.ts');
  });
  it('Attention: system alerts + only OPEN CEO questions; no activity events', () => {
    const qc = client();
    qc.setQueryData(companyKeys.chairman('A', 'alerts'), projections.alerts([alert('a1')], 'A'));
    qc.setQueryData(companyKeys.ceo('A', 'questions'), projections.ceoQuestions([question('q1', 'OPEN'), question('q2', 'ANSWERED')], 'A'));
    const html = render(qc, <AttentionWorkspace companyId="A" />);
    for (const s of ['Alert a1', 'system alert', 'Q q1?', 'Not answered']) expect(html).toContain(s);
    expect(html).not.toContain('Q q2?');
  });
  it('loading shows skeletons; keys company-partitioned; registry has no dead OS links', () => {
    expect(render(client(), <AttentionWorkspace companyId="A" />)).toContain('Loading');
    expect(companyKeys.ceo('A', 'feed')).not.toEqual(companyKeys.ceo('B', 'feed'));
    for (const s of ['ceo', 'decisions', 'attention']) expect(COMPANY_DOMAINS.find((d) => d.slug === s)?.status).toBe('ready');
    expect(OS_DOMAINS.map((d) => d.slug)).not.toContain('decisions');
    expect(OS_DOMAINS.map((d) => d.slug)).not.toContain('attention');
  });
});
