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
import { applyProjectFilter, projectFilterOptions, readProjectFilter } from '@/lib/project-filter';
import { ProjectDetailView, ProjectList } from '@/components/project-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { COMPANY_DOMAINS } from '@/lib/domains';
import type { ProjectDetail, ProjectSummary } from '@/lib/types';

/** Full backend Project row as ChairmanController.getProject returns it (financial + task data included). */
const backendProject = (id: string) => ({
  id, companyId: 'A', clientId: 'c1', opportunityId: 'o1', proposalId: 'p1',
  name: `Website ${id}`, description: 'Real description', type: 'WEBSITE', status: 'ACTIVE',
  quotedPrice: 4500000, expectedRevenue: 4600000, realizedRevenue: 111111, estimatedCost: 222222, actualCost: 333333, acCost: 444, margin: 55, financialStatus: 'PAID',
  startDate: '2026-09-01T00:00:00.000Z', targetEndDate: '2026-12-01T00:00:00.000Z', createdAt: 'x', updatedAt: 'x',
  client: { id: 'c1', companyId: 'A', name: 'Sandbox Client', organizationName: 'Org', status: 'ACTIVE' },
  requirements: [{ id: 'r1', projectId: id, title: 'Login page', priority: 'HIGH', status: 'OPEN', description: 'd' }],
  plans: [{ id: 'pl1', summary: 'PLAN-SECRET-SUMMARY', version: 1 }],
  milestones: [{ id: 'm2', name: 'Launch', sequence: 2, dueAt: null, status: 'PLANNED' }, { id: 'm1', name: 'Design', sequence: 1, dueAt: '2026-10-01T00:00:00.000Z', status: 'COMPLETED' }],
  risks: [{ id: 'k1', title: 'Scope creep', probability: 3, impact: 4, severity: 12, status: 'OPEN' }],
  tasks: [{ id: 't1', title: 'TASK-SHOULD-NOT-APPEAR', status: 'TODO' }],
  assignments: [{ id: 'a1', projectId: id, employeeId: 'e1', role: 'Lead', allocation: 50, status: 'ACTIVE',
    employee: { id: 'e1', name: 'Bob', salary: 987654, identitySeed: 'SEED-SECRET', companyId: 'A' } }],
  deliveries: [{ id: 'd1', buildId: 'BUILD-SECRET' }],
  revenueRecords: [{ amount: 777777 }], projectCosts: [{ amount: 888888 }],
});
const FORBIDDEN = /4500000|4600000|111111|222222|333333|888888|777777|PAID|987654|SEED-SECRET|TASK-SHOULD-NOT-APPEAR|PLAN-SECRET|BUILD-SECRET|opportunityId|proposalId|quotedPrice|margin|companyId|salary/;

describe('project projections', () => {
  it('list keeps identity, client name, dates, status and an assignment count only', () => {
    const out = projections.projects([backendProject('p1')]);
    expect(out).toEqual([{ id: 'p1', name: 'Website p1', description: 'Real description', type: 'WEBSITE', status: 'ACTIVE',
      startDate: '2026-09-01T00:00:00.000Z', targetEndDate: '2026-12-01T00:00:00.000Z', client: { name: 'Sandbox Client' }, assignmentCount: 1 }]);
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
  });
  it('detail adds milestones, risks, requirements, team; drops tasks, plans, deliveries, finance and employee rows', () => {
    const out = projections.project(backendProject('p1'));
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
    expect(out).toMatchObject({ team: [{ employeeId: 'e1', name: 'Bob', role: 'Lead', allocation: 50, status: 'ACTIVE' }], risks: [{ title: 'Scope creep', severity: 12 }] });
    expect(Object.keys(out!)).not.toContain('tasks');
  });
  it('a missing project body becomes 404, malformed rows are dropped', () => {
    expect(projections.project(null)).toBeUndefined();
    expect(projections.projects([{ id: 'x' }, null])).toEqual([]);
  });
});

describe('BFF project routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('?')[0]!.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['chairman/projects', 'chairman/projects/p1'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('valid list request forwards X-Company-Id and returns projected rows only', async () => {
    reply(200, [backendProject('p1')]);
    const res = await call('chairman/projects', { 'x-aevora-company': 'A' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    expect(await res.text()).not.toMatch(FORBIDDEN);
  });
  it.each([[401], [403], [404]])('backend %i on detail is preserved (foreign project -> 404)', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('chairman/projects/pX', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'projects/p1/requirements', 'projects/p1/team', 'projects/p1/plans', 'projects/plans/x/approve', 'projects/p1/milestones',
    'chairman/projects/p1/tasks', 'tasks/t1', 'employees/e1/tasks', 'delivery/projects', 'delivery/formal/p1/package',
    'chairman/projects/p1/extra', 'chairman/financials', 'project',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const proj = (id: string, name: string, status: string, type = 'WEBSITE', client: string | null = 'Acme'): ProjectSummary =>
  ({ id, name, description: null, type, status, startDate: null, targetEndDate: null, client: client ? { name: client } : null, assignmentCount: 0 });

describe('project filters (URL state)', () => {
  const rows = [proj('1', 'Zeta site', 'ACTIVE'), proj('2', 'Alpha node', 'PAUSED', 'NODE', 'Globex'), proj('3', 'Beta', 'ACTIVE', 'WEBSITE', null)];
  it('search, status, type; sorted; options only from returned values', () => {
    expect(readProjectFilter(new URLSearchParams('q=x&status=ACTIVE&type=NODE'))).toEqual({ q: 'x', status: 'ACTIVE', type: 'NODE' });
    expect(applyProjectFilter(rows, readProjectFilter(null)).map((p) => p.name)).toEqual(['Alpha node', 'Beta', 'Zeta site']);
    expect(applyProjectFilter(rows, { q: 'globex', status: '', type: '' }).map((p) => p.id)).toEqual(['2']);
    expect(applyProjectFilter(rows, { q: '', status: 'ACTIVE', type: 'WEBSITE' }).map((p) => p.id)).toEqual(['3', '1']);
    expect(projectFilterOptions(rows)).toEqual({ statuses: ['ACTIVE', 'PAUSED'], types: ['NODE', 'WEBSITE'] });
  });
});

describe('project rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:9')), retry: false });

  it('list: table and cards with backend values, links by project id', () => {
    const html = renderToStaticMarkup(<ProjectList rows={[proj('p1', 'Website p1', 'ACTIVE')]} companyId="A" />);
    expect(html).toContain('<th scope="row"');
    expect(html.match(/Website p1/g)?.length).toBe(2);
    expect(html).toContain('href="/company/A/projects/p1"');
    expect(html).not.toMatch(/progress|health|budget|%/i);
  });
  it('detail renders real sub-records, sorted milestones, team links; no tasks or finance', () => {
    const qc = client();
    qc.setQueryData(companyKeys.projects('A', 'detail', 'p1'), projections.project(backendProject('p1')) as ProjectDetail);
    const html = render(qc, <ProjectDetailView companyId="A" projectId="p1" />);
    for (const s of ['Website p1', 'Real description', 'Sandbox Client', 'Login page', 'Scope creep', 'Bob', '50% allocation', 'href="/company/A/organization/workforce/e1"']) expect(html).toContain(s);
    expect(html.indexOf('1. Design')).toBeLessThan(html.indexOf('2. Launch'));
    expect(html).not.toMatch(FORBIDDEN);
    expect(html).toContain('Tasks, deliveries and financial figures are not shown');
  });
  it('detail with no sub-records shows explicit empty text, not invented content', () => {
    const qc = client();
    qc.setQueryData(companyKeys.projects('A', 'detail', 'p2'), { ...proj('p2', 'Bare', 'PLANNED'), milestones: [], risks: [], requirements: [], team: [] });
    const html = render(qc, <ProjectDetailView companyId="A" projectId="p2" />);
    for (const s of ['No one is assigned', 'No milestones recorded', 'No requirements recorded', 'No risks recorded', 'Not set']) expect(html).toContain(s);
  });
  it('loading shows a skeleton, no values', () => {
    expect(render(client(), <ProjectDetailView companyId="A" projectId="p1" />)).toContain('Loading project');
  });
  it('foreign or missing project (404) and non-Chairman (403) show fixed copy with a way back', async () => {
    const qc = client();
    await fail(qc, companyKeys.projects('A', 'detail', 'pX'), 404);
    const a = render(qc, <ProjectDetailView companyId="A" projectId="pX" />);
    expect(a).toContain('Not found');
    expect(a).toContain('Back to projects');
    const qc2 = client();
    await fail(qc2, companyKeys.projects('A', 'detail', 'p1'), 403);
    const b = render(qc2, <ProjectDetailView companyId="A" projectId="p1" />);
    expect(b).toContain('Chairman only');
    expect(b).not.toContain('stack.ts');
  });
  it('project keys are company-partitioned; Tasks remains blocked in the registry', () => {
    expect(companyKeys.projects('A', 'list')).not.toEqual(companyKeys.projects('B', 'list'));
    expect(COMPANY_DOMAINS.find((d) => d.slug === 'tasks')?.status).toBe('blocked');
    expect(COMPANY_DOMAINS.find((d) => d.slug === 'projects')?.status).toBe('ready');
  });
});
