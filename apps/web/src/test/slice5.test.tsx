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
import { AssistanceList, IntelligenceOverview, ProposalDetail, SessionDetail, SummaryPanel } from '@/components/intelligence-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import type { DecisionProposalView, IntelligenceSessionView, IntelligenceSummary } from '@/lib/types';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

/** As CompanyIntelligenceService returns it, including the hard-coded confidence and finance metrics. */
const backendSummary = {
  scope: 'COMPANY', companyId: A, generatedAt: '2026-10-06T05:00:00.000Z',
  sourceFreshness: { CompanyState: '2026-10-06T04:59:00.000Z' },
  facts: [{ statement: 'Company has 4 employees across 6 departments.', source: 'Workforce' }],
  metrics: [
    { key: 'totalEmployees', value: 4, domain: 'Workforce' }, { key: 'activeProjects', value: 0, domain: 'Projects' },
    { key: 'acBalance', value: 123456789, domain: 'Finance' }, { key: 'totalRevenue', value: 98765432, domain: 'Finance' },
  ],
  observations: [], trends: [], risks: [{ title: 'Blocked Projects', count: 2 }], opportunities: [], anomalies: [],
  supportingSources: ['CompanyStateService'], provenance: [{ domain: 'Workforce' }],
  confidence: 0.95, uncertainty: ['UNCERTAINTY-BOILERPLATE'], limitations: ['LIMITATION-BOILERPLATE'], missingData: ['No significant financial activity recorded.'],
};
const backendProposal = {
  id: 'prop-1', companyId: A, employeeId: 'emp-1', sessionId: 'sess-1', status: 'PROPOSED', title: 'Hire a designer',
  problem: 'Design backlog', recommendation: 'Hire one', rationale: 'Two projects waiting', confidence: 'MEDIUM', impactLevel: 'HIGH',
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: 'x', systemPrompt: 'PROMPT-SECRET', rawModelResponse: 'RAW-MODEL-SECRET',
  options: [{ id: 'o1', proposalId: 'prop-1', title: 'Contract', description: 'Short-term', estimatedEffort: 'LOW', estimatedImpact: 'MEDIUM', score: 7 }],
  reviews: [{ id: 'rv1', proposalId: 'prop-1', reviewerId: 'REVIEWER-ID-SECRET', result: 'APPROVED', feedback: 'Go', createdAt: '2026-10-02T10:00:00.000Z' }],
};
const backendSession = {
  id: 'sess-1', companyId: A, employeeId: 'EMP-ID-SECRET', objective: 'Reduce backlog', status: 'COMPLETED', taskId: 'TASK-ID-SECRET',
  projectId: null, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T11:00:00.000Z',
  assessments: [{ id: 'as1', sessionId: 'sess-1', summary: 'Backlog is growing', recommendation: 'Add capacity', risks: { raw: 'RAW-JSON-SECRET' }, uncertainties: null, assumptions: null, options: null, createdAt: '2026-10-01T10:00:00.000Z', evidence: [{ content: 'EVIDENCE-RAW' }] }],
  plans: [{ id: 'pl1', steps: [{ instruction: 'PLAN-STEP-SECRET' }] }],
  proposals: [{ id: 'prop-1', title: 'Hire a designer', status: 'PROPOSED', options: [], reviews: [] }],
};
const LEAK = /0\.95|confidence":0|123456789|98765432|acBalance|totalRevenue|UNCERTAINTY-BOILERPLATE|LIMITATION-BOILERPLATE|PROMPT-SECRET|RAW-MODEL-SECRET|REVIEWER-ID-SECRET|EMP-ID-SECRET|TASK-ID-SECRET|RAW-JSON-SECRET|EVIDENCE-RAW|PLAN-STEP-SECRET|companyId/;

describe('intelligence projections', () => {
  it('summary: drops fabricated confidence, boilerplate claims and finance metrics; keeps facts, risks, sources', () => {
    const out = projections.intelligenceSummary(backendSummary)!;
    expect(JSON.stringify(out)).not.toMatch(LEAK);
    expect(out.metrics.map((m) => m.key)).toEqual(['totalEmployees', 'activeProjects']);
    expect(out.sources).toEqual([{ name: 'CompanyState', asOf: '2026-10-06T04:59:00.000Z' }]);
    expect(out.risks).toEqual([{ title: 'Blocked Projects', count: 2 }]);
  });
  it('proposal: keeps recorded fields verbatim, drops prompts, raw model output and reviewer ids', () => {
    const [p] = projections.proposals([backendProposal]);
    expect(JSON.stringify(p)).not.toMatch(LEAK);
    expect(p).toMatchObject({ confidence: 'MEDIUM', impactLevel: 'HIGH', proposerId: 'emp-1', sessionId: 'sess-1' });
  });
  it('session: assessments as summary + recommendation only; no raw JSON, evidence, plans, task or employee ids', () => {
    const s = projections.session(backendSession);
    expect(JSON.stringify(s)).not.toMatch(LEAK);
    expect(s?.assessments).toEqual([{ id: 'as1', summary: 'Backlog is growing', recommendation: 'Add capacity', createdAt: '2026-10-01T10:00:00.000Z' }]);
  });
  it('malformed rows are dropped, never fabricated', () => {
    expect(projections.proposals([{ id: 'x' }, null])).toEqual([]);
    expect(projections.intelligenceSummary('nope')).toBeUndefined();
  });
});

describe('BFF intelligence routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('?')[0]!.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  const routes = [`company-intelligence/company/${A}`, `intelligence/company/${A}/proposals`, `intelligence/company/${A}/assistance-requests`, 'intelligence/sessions/sess-1'];
  it.each(routes)('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(routes.slice(0, 3))('%s: a path company different from the header is refused before the backend', async (p) => {
    expect((await call(p, { 'x-aevora-company': B })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('valid summary request forwards X-Company-Id and returns the projection only', async () => {
    reply(200, backendSummary);
    const res = await call(`company-intelligence/company/${A}`, { 'x-aevora-company': A });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe(A);
    expect(await res.text()).not.toMatch(LEAK);
  });
  it.each([[400], [401], [403], [404]])('backend %i preserved for a session (foreign/missing -> 404, malformed -> 400)', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('intelligence/sessions/sX', { 'x-aevora-company': A })).status).toBe(status);
  });
  it.each([
    `company-intelligence/group/${A}`, 'foundation-intelligence/datasets', 'foundation-intelligence/model-versions', 'foundation-intelligence/analytics/summary',
    'chairman/research/inference', 'chairman/knowledge', 'chairman/knowledge/k1', 'research/r1', 'v12-assistant/ask', 'assistant/message', 'intelligence/sessions',
    `intelligence/company/${A}/other`, 'tasks/t1',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': A })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('intelligence rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:7')), retry: false });
  const summary = projections.intelligenceSummary(backendSummary) as IntelligenceSummary;
  const proposal = projections.proposals([backendProposal])[0] as DecisionProposalView;

  it('summary shows real facts/risks/missing data, provenance timestamps, and states no model was run', () => {
    const html = renderToStaticMarkup(<SummaryPanel data={summary} />);
    for (const s of ['Company has 4 employees', 'Blocked Projects', '(2)', 'No significant financial activity', 'CompanyState', 'No model was run', 'dateTime="2026-10-06T05:00:00.000Z"']) expect(html).toContain(s);
    expect(html).not.toMatch(/AI-generated|confidence|sentiment|health|\d+ minutes ago/i);
  });
  it('overview: empty persisted lists are honest; summary rendered; nothing invented', () => {
    const qc = client();
    qc.setQueryData(companyKeys.intelligence(A, 'summary'), summary);
    qc.setQueryData(companyKeys.intelligence(A, 'proposals'), []);
    qc.setQueryData(companyKeys.intelligence(A, 'assistance'), []);
    const html = render(qc, <IntelligenceOverview companyId={A} />);
    expect(html).toContain('No decision proposals');
    expect(html).toContain('No assistance requests');
    expect(html).toContain('Blocked Projects');
  });
  it('overview loading and failure states (403, 503) use fixed copy', async () => {
    expect(render(client(), <IntelligenceOverview companyId={A} />)).toContain('Loading company summary');
    const qc = client();
    await fail(qc, companyKeys.intelligence(A, 'summary'), 403);
    await fail(qc, companyKeys.intelligence(A, 'proposals'), 503);
    await fail(qc, companyKeys.intelligence(A, 'assistance'), 404);
    const html = render(qc, <IntelligenceOverview companyId={A} />);
    for (const s of ['Access denied', 'Backend unavailable', 'Not found']) expect(html).toContain(s);
    expect(html).not.toContain('stack.ts');
  });
  it('proposal detail: recorded values labelled "as recorded", proposer from the company workforce, session link', () => {
    const qc = client();
    qc.setQueryData(companyKeys.intelligence(A, 'proposals'), [proposal]);
    qc.setQueryData(companyKeys.org(A, 'employees'), [{ id: 'emp-1', name: 'Diana', status: 'ACTIVE', hireDate: null, role: null, department: null }]);
    const html = render(qc, <ProposalDetail companyId={A} proposalId="prop-1" />);
    for (const s of ['Hire a designer', 'Confidence (as recorded)', 'MEDIUM', 'HIGH', 'Diana', 'Design backlog', 'Contract', 'score 7 (as recorded)', 'APPROVED', `href="/company/${A}/intelligence/sessions/sess-1"`]) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
  });
  it('proposal not in the company list (foreign or missing) is not found', () => {
    const qc = client();
    qc.setQueryData(companyKeys.intelligence(A, 'proposals'), [proposal]);
    qc.setQueryData(companyKeys.org(A, 'employees'), []);
    const html = render(qc, <ProposalDetail companyId={A} proposalId="prop-foreign" />);
    expect(html).toContain('Not found');
    expect(html).not.toContain('Hire a designer');
  });
  it('session detail renders assessments with progressive disclosure; foreign/malformed is not found', async () => {
    const qc = client();
    qc.setQueryData(companyKeys.intelligence(A, 'session', 'sess-1'), projections.session(backendSession) as IntelligenceSessionView);
    const html = render(qc, <SessionDetail companyId={A} sessionId="sess-1" />);
    for (const s of ['Reduce backlog', 'Backlog is growing', '<details', 'Add capacity', 'Hire a designer']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
    for (const status of [404, 400]) {
      const q = client();
      await fail(q, companyKeys.intelligence(A, 'session', 'bad'), status);
      expect(render(q, <SessionDetail companyId={A} sessionId="bad" />)).toContain('Not found');
    }
  });
  it('assistance list renders backend fields only', () => {
    const html = renderToStaticMarkup(<AssistanceList rows={[{ id: 'a1', question: 'Need access to repo?', reason: null, urgency: 'HIGH', status: 'OPEN', createdAt: '2026-10-01T10:00:00.000Z' }]} />);
    expect(html).toContain('Need access to repo?');
    expect(html).toContain('Urgency HIGH');
  });
  it('intelligence keys are company-partitioned', () => {
    expect(companyKeys.intelligence(A, 'summary')).not.toEqual(companyKeys.intelligence(B, 'summary'));
  });
});
