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
import { CycleDetail, OperationsWorkspace } from '@/components/operations-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { COMPANY_DOMAINS, OS_DOMAINS } from '@/lib/domains';

/** Shape of a real OperatingLoopCycle row (values from the live database). */
const cycle = (id: string, companyId = 'A', extra: Record<string, unknown> = {}) => ({
  id, companyId, phase: 'COMPLETE', trigger: 'scheduled_business_loop',
  observations: { raw: 'OBS-SECRET' }, analysis: { reasoning: 'ANALYSIS-SECRET' }, options: [{ title: 'OPTION-SECRET' }],
  recommendation: { risk: 'LOW', title: 'Continue current operations', effort: 'LOW', impact: 'LOW' }, chairmanVerdict: null,
  execution: { action: 'Continue current operations', result: 'no matching dispatcher', service: 'SERVICE-SECRET', dispatched: false, executedAt: 'x' },
  measurements: { healthScore: 'UNKNOWN', postExecutionKpis: [] }, lessons: [{ outcome: 'LESSON-SECRET' }], error: null,
  startedAt: '2026-10-05T21:49:55.930Z', completedAt: '2026-10-05T21:49:55.969Z', createdAt: 'x', updatedAt: 'x', ...extra,
});
const LEAK = /SECRET|companyId|observations|analysis|options|measurements|lessons|healthScore|"error"/;

describe('slice 9 projection', () => {
  it('keeps phase, trigger, verdict, timestamps, recommendation labels and dispatch state; drops raw phase JSON and error text', () => {
    const out = projections.operatingCycles([cycle('c1'), cycle('c2', 'B'), { id: 'bad' }], 'A');
    expect(out.map((c) => c.id)).toEqual(['c1']);
    expect(out[0]).toMatchObject({ failed: false, recommendation: { title: 'Continue current operations', impact: 'LOW' }, execution: { dispatched: false, result: 'no matching dispatcher' } });
    expect(JSON.stringify(out)).not.toMatch(LEAK);
    expect(projections.operatingCycle(cycle('c1', 'A', { error: 'ERROR-SECRET boom' }), 'A')).toMatchObject({ failed: true });
    expect(JSON.stringify(projections.operatingCycle(cycle('c1', 'A', { error: 'ERROR-SECRET' }), 'A'))).not.toMatch(LEAK);
  });
  it('a cycle of another company is not found', () => {
    expect(projections.operatingCycle(cycle('c1', 'B'), 'A')).toBeUndefined();
    expect(projections.operatingCycle(null, 'A')).toBeUndefined();
  });
});

describe('slice 9 BFF routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['operating-loop/A/cycles', 'operating-loop/cycle/c1'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('path company must match the header company', async () => {
    expect((await call('operating-loop/B/cycles', { 'x-aevora-company': 'A' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('malformed id never reaches the backend', async () => {
    expect((await call('operating-loop/cycle/bad%20id!', { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('detail of a foreign cycle is 404 even if the backend returned it; backend 404 preserved', async () => {
    reply(200, cycle('c1', 'B'));
    expect((await call('operating-loop/cycle/c1', { 'x-aevora-company': 'A' })).status).toBe(404);
    reply(404, { message: 'm' });
    expect((await call('operating-loop/cycle/nope', { 'x-aevora-company': 'A' })).status).toBe(404);
  });
  it('valid list forwards X-Company-Id and returns the projection only', async () => {
    reply(200, [cycle('c1')]);
    const res = await call('operating-loop/A/cycles', { 'x-aevora-company': 'A' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    expect(await res.text()).not.toMatch(LEAK);
  });
  it.each([[401], [403]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('operating-loop/A/cycles', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'operating-loop/A/cycle', 'operating-loop/cycle/c1/verdict', 'operating-loop/A/scan-opportunities', 'operating-loop/A/pending-approvals',
    'operating-loop/A/context', 'operating-loop/A/memory/search', 'operating-loop/A/performance', 'operating-loop/performance/agent/e1',
    'operating-loop/A/error-pool', 'operating-loop/error-pool/scan', 'operating-loop/error-pool/retry/c1', 'chairman/operating-loop/cycle',
    'continuous-improvement/company/A/detect', 'continuous-improvement/company/A/proposals', 'continuous-improvement/proposals/p1/approve',
    'autonomous-enterprise/operating-cycles', 'autonomous-enterprise/operating-cycles/open', 'autonomous-enterprise/decisions/d1/decide',
    'autonomous-enterprise/escalations', 'autonomous-enterprise/objectives', 'boardroom/meetings', 'boardroom/meetings/m1/transcript',
    'ceo/weekly-reports', 'ceo/weekly-reports/run', 'groups/g1/report', 'job', 'agents/a1/run',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('slice 9 rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:1')), retry: false });

  it('list: system provenance, "not dispatched" is never shown as done, links by id, no actions', () => {
    const qc = client();
    qc.setQueryData(companyKeys.operations('A', 'cycles'), projections.operatingCycles([cycle('c1')], 'A'));
    const html = render(qc, <OperationsWorkspace companyId="A" />);
    for (const s of ['Scheduled business loop (system)', 'Not dispatched (no matching dispatcher)', 'COMPLETE', 'rule-based', 'href="/company/A/operations/c1"']) expect(html).toContain(s);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/executed|succeeded|model ran/i);
  });
  it('detail: recorded labels, verdict, error flag without text', () => {
    const qc = client();
    qc.setQueryData(companyKeys.operations('A', 'cycle', 'c1'), projections.operatingCycle(cycle('c1', 'A', { error: 'ERROR-SECRET' }), 'A'));
    const html = render(qc, <CycleDetail companyId="A" cycleId="c1" />);
    for (const s of ['Continue current operations', 'Impact label', 'None recorded', 'recorded an error (details are not shown)', 'Back to operations']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
  });
  it('loading, empty, not-found, forbidden and unavailable states', async () => {
    expect(render(client(), <OperationsWorkspace companyId="A" />)).toContain('Loading');
    const empty = client();
    empty.setQueryData(companyKeys.operations('A', 'cycles'), []);
    expect(render(empty, <OperationsWorkspace companyId="A" />)).toContain('No cycles');
    for (const [status, text] of [[404, 'Not found'], [403, 'Access denied'], [503, 'Backend unavailable']] as const) {
      const qc = client();
      await fail(qc, companyKeys.operations('A', 'cycle', 'cX'), status);
      const html = render(qc, <CycleDetail companyId="A" cycleId="cX" />);
      expect(html).toContain(text);
      expect(html).not.toContain('stack.ts');
    }
  });
  it('registry: operations ready; improvement and reports removed (no data, no placeholders)', () => {
    expect(COMPANY_DOMAINS.find((d) => d.slug === 'operations')?.status).toBe('ready');
    expect(COMPANY_DOMAINS.map((d) => d.slug)).not.toContain('improvement');
    expect(OS_DOMAINS.map((d) => d.slug)).not.toContain('reports');
    expect(companyKeys.operations('A', 'cycles')).not.toEqual(companyKeys.operations('B', 'cycles'));
  });
});
