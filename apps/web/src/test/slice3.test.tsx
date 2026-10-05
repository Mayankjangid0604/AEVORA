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
import { applyFilter, filterOptions, readFilter } from '@/lib/workforce-filter';
import { WorkforceList } from '@/components/workforce-list';
import { ProvenanceBadge, provenanceLabel } from '@/components/provenance-badge';
import { DepartmentDetail, EmployeeDetail, OrganizationOverview } from '@/components/organization-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import type { DepartmentSummary, EmployeeSummary } from '@/lib/types';

// A full backend Employee row: everything below `name` except the projected fields must never reach the browser.
const backendEmployee = (id: string, deptId: string) => ({
  id, name: `Person ${id}`, status: 'ACTIVE', hireDate: '2026-01-02T00:00:00.000Z',
  identitySeed: 'SEED-SECRET', salary: 987654, performance: 77, reliability: 66, experience: 5,
  credentialHash: 'HASH-SECRET', credentialSalt: 'SALT-SECRET', hashAlgorithm: 'PBKDF2-SHA512', workFactor: 600000,
  companyId: 'A', departmentId: deptId, roleId: 'r1', locationId: null,
  role: { id: 'r1', title: 'Engineer', level: 3, accessLevel: 'SYSTEM', companyId: 'A' },
  department: { id: deptId, name: `Dept ${deptId}`, status: 'ACTIVE', companyId: 'A' },
});
const SENSITIVE_VALUES = /SEED-SECRET|987654|HASH-SECRET|SALT-SECRET|PBKDF2/;
const SENSITIVE = /SEED-SECRET|987654|HASH-SECRET|SALT-SECRET|PBKDF2|identitySeed|salary|credential|accessLevel|performance|reliability|companyId/;

describe('BFF projections (server-side field whitelist)', () => {
  it('employee rows keep only id, name, status, hireDate, role.title, department.{id,name}', () => {
    const out = projections.employees([backendEmployee('e1', 'd1')]);
    expect(out).toEqual([{ id: 'e1', name: 'Person e1', status: 'ACTIVE', hireDate: '2026-01-02T00:00:00.000Z', role: { title: 'Engineer' }, department: { id: 'd1', name: 'Dept d1' } }]);
    expect(JSON.stringify(out)).not.toMatch(SENSITIVE);
  });
  it('department detail: backend null (missing or foreign) becomes undefined -> 404', () => {
    expect(projections.department(null)).toBeUndefined();
    expect(projections.department({ id: 'd', name: 'D', status: 'ACTIVE', companyId: 'A' })).toEqual({ id: 'd', name: 'D', status: 'ACTIVE' });
  });
  it('worker profiles keep only employeeId + workerType (no salary from the included employee)', () => {
    const out = projections.provenanceList([{ id: 'p', employeeId: 'e1', workerType: 'AI_AGENT', aiBudgetLimit: 5, employee: { name: 'x', salary: 987654 } }]);
    expect(out).toEqual([{ employeeId: 'e1', workerType: 'AI_AGENT' }]);
  });
  it('malformed entries are dropped, never fabricated', () => {
    expect(projections.employees([{ id: 1 }, null, 'x'])).toEqual([]);
    expect(projections.departments('not a list')).toEqual([]);
  });
});

describe('BFF organization routes', () => {
  const ORIGIN = 'http://localhost:3000';
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`${ORIGIN}/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('?')[0]!.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  const routes = ['organization/departments', 'organization/departments/d1', 'organization/employees', 'organization/employee/e1', 'workforce/profiles', 'workforce/profiles/e1'];

  it.each(routes)('%s requires an explicit company (no first-company fallback)', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valid request forwards X-Company-Id and returns only projected fields', async () => {
    reply(200, [backendEmployee('e1', 'd1')]);
    const res = await call('organization/employees', { 'x-aevora-company': 'A' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    expect(await res.text()).not.toMatch(SENSITIVE);
  });

  it('foreign/missing department (backend 200 null) is a 404 at the BFF', async () => {
    reply(200, null);
    expect((await call('organization/departments/dX', { 'x-aevora-company': 'A' })).status).toBe(404);
  });

  it.each([[401], [403], [404]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('organization/employee/eX', { 'x-aevora-company': 'A' })).status).toBe(status);
  });

  it('query strings are not forwarded', async () => {
    reply(200, []);
    await call('workforce/profiles?workerType=AI', { 'x-aevora-company': 'A' });
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/workforce\/profiles$/);
  });

  it.each([
    'organization', 'organization/chart', 'organization/activity', 'organization/audit', 'organization/employee/e1/history',
    'organization/employee/e1/kpis', 'organization/employee/e1/budget', 'organization/employee/e1/performance',
    'organization/employee/e1/permissions', 'organization/employee/e1/responsibilities', 'organization/employee/e1/succession',
    'chairman/employees', 'chairman/departments', 'companies/A/employees', 'employees/e1', 'workforce/analytics/headcount', 'workforce/reviews',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const emp = (id: string, name: string, status: string, dept: string | null, role = 'Engineer'): EmployeeSummary =>
  ({ id, name, status, hireDate: null, role: { title: role }, department: dept ? { id: dept, name: `Dept ${dept}` } : null });

describe('workforce filtering (URL state over the backend-returned list)', () => {
  const rows = [emp('1', 'Zed', 'ACTIVE', 'd1'), emp('2', 'Amy', 'SUSPENDED', 'd2', 'Analyst'), emp('3', 'Bob', 'ACTIVE', null)];
  const prov = new Map([['1', 'HUMAN'], ['2', 'AI_AGENT']]);
  it('reads filters from the URL', () => {
    expect(readFilter(new URLSearchParams('q=a&status=ACTIVE&department=d1&type=none'))).toEqual({ q: 'a', status: 'ACTIVE', department: 'd1', type: 'none' });
  });
  it('filters by search, status, department, worker type and sorts by name', () => {
    expect(applyFilter(rows, readFilter(null), prov).map((e) => e.name)).toEqual(['Amy', 'Bob', 'Zed']);
    expect(applyFilter(rows, { q: 'analyst', status: '', department: '', type: '' }, prov).map((e) => e.id)).toEqual(['2']);
    expect(applyFilter(rows, { q: '', status: 'ACTIVE', department: 'd1', type: '' }, prov).map((e) => e.id)).toEqual(['1']);
    expect(applyFilter(rows, { q: '', status: '', department: '', type: 'none' }, prov).map((e) => e.id)).toEqual(['3']);
    expect(applyFilter(rows, { q: '', status: '', department: '', type: 'AI_AGENT' }, prov).map((e) => e.id)).toEqual(['2']);
  });
  it('options come only from returned data', () => {
    const o = filterOptions(rows, prov);
    expect(o.statuses).toEqual(['ACTIVE', 'SUSPENDED']);
    expect(o.departments).toEqual([['d1', 'Dept d1'], ['d2', 'Dept d2']]);
    expect(o.types).toEqual(['AI_AGENT', 'HUMAN']);
    expect(o.hasUnrecorded).toBe(true);
  });
});

describe('workforce rendering', () => {
  it('desktop table has row/column headers; mobile list has the same people', () => {
    const html = renderToStaticMarkup(<WorkforceList rows={[emp('e1', 'Asha', 'ACTIVE', 'd1')]} provenance={new Map([['e1', 'HUMAN']])} base="/company/A/organization" />);
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('<th scope="row"');
    expect(html.match(/Asha/g)?.length).toBe(2);
    expect(html).toContain('href="/company/A/organization/workforce/e1"');
    expect(html).toContain('href="/company/A/organization/departments/d1"');
  });
  it('provenance comes only from workerType: a "CEO"-named human is Human; no profile is Not recorded', () => {
    const html = renderToStaticMarkup(<WorkforceList rows={[emp('e1', 'AI CEO Bot', 'ACTIVE', null, 'Chief Executive'), emp('e2', 'X', 'ACTIVE', null)]} provenance={new Map([['e1', 'HUMAN']])} base="/b" />);
    expect(html).toContain('Human');
    expect(html).toContain('Not recorded');
    expect(html).not.toMatch(/AI executive|AI agent/);
    expect(provenanceLabel('AI_EXECUTIVE')).toBe('AI executive');
    expect(renderToStaticMarkup(<ProvenanceBadge workerType={null} />)).toContain('Not recorded');
  });
  it('failed provenance shows Unavailable, never a guessed type', () => {
    expect(renderToStaticMarkup(<WorkforceList rows={[emp('e1', 'A', 'ACTIVE', null)]} provenance={null} base="/b" />)).toContain('Unavailable');
  });
});

describe('organization views (rendered from the TanStack cache)', () => {
  const render = (client: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'backend detail stack.ts:1')), retry: false });

  it('loading: skeletons, no values', () => {
    const html = render(client(), <OrganizationOverview companyId="A" />);
    expect(html).toContain('Loading departments');
    expect(html).not.toMatch(/returned/);
  });
  it('success: departments with headcount derived from the returned workforce only', () => {
    const qc = client();
    const depts: DepartmentSummary[] = [{ id: 'd1', name: 'Engineering', status: 'ACTIVE' }, { id: 'd2', name: 'Sales', status: 'INACTIVE' }];
    qc.setQueryData(companyKeys.org('A', 'departments'), depts);
    qc.setQueryData(companyKeys.org('A', 'employees'), [emp('e1', 'A', 'ACTIVE', 'd1'), emp('e2', 'B', 'ACTIVE', 'd1')]);
    const html = render(qc, <OrganizationOverview companyId="A" />);
    expect(html).toContain('Engineering');
    expect(html).toContain('2 people');
    expect(html).toContain('0 people');
    expect(html).toContain('2 returned');
  });
  it('empty departments state', () => {
    const qc = client();
    qc.setQueryData(companyKeys.org('A', 'departments'), []);
    qc.setQueryData(companyKeys.org('A', 'employees'), []);
    expect(render(qc, <OrganizationOverview companyId="A" />)).toContain('No departments');
  });
  it('403 and backend errors show fixed copy, never the backend message', async () => {
    const qc = client();
    await fail(qc, companyKeys.org('A', 'departments'), 403);
    await fail(qc, companyKeys.org('A', 'employees'), 503);
    const html = render(qc, <OrganizationOverview companyId="A" />);
    expect(html).toContain('Access denied');
    expect(html).toContain('Backend unavailable');
    expect(html).not.toContain('stack.ts');
  });
  it('employee detail: real fields, provenance, no sensitive data', () => {
    const qc = client();
    qc.setQueryData(companyKeys.org('A', 'employee', 'e1'), { ...emp('e1', 'Asha', 'ACTIVE', 'd1'), hireDate: '2026-01-02T00:00:00.000Z' });
    qc.setQueryData(companyKeys.org('A', 'provenance', 'e1'), 'AI_MANAGER');
    const html = render(qc, <EmployeeDetail companyId="A" employeeId="e1" />);
    for (const s of ['Asha', 'Engineer', 'Dept d1', 'AI manager', '2026-01-02']) expect(html).toContain(s);
    expect(html).not.toMatch(SENSITIVE_VALUES);
  });
  it('foreign or missing employee (404) shows not found with a way back, never another employee', async () => {
    const qc = client();
    await fail(qc, companyKeys.org('A', 'employee', 'eX'), 404);
    qc.setQueryData(companyKeys.org('A', 'provenance', 'eX'), null);
    const html = render(qc, <EmployeeDetail companyId="A" employeeId="eX" />);
    expect(html).toContain('Not found');
    expect(html).toContain('Back to workforce');
  });
  it('department detail lists only members of that department; 404 for a foreign department', async () => {
    const qc = client();
    qc.setQueryData(companyKeys.org('A', 'department', 'd1'), { id: 'd1', name: 'Engineering', status: 'ACTIVE' });
    qc.setQueryData(companyKeys.org('A', 'employees'), [emp('e1', 'In', 'ACTIVE', 'd1'), emp('e2', 'Out', 'ACTIVE', 'd2')]);
    qc.setQueryData(companyKeys.org('A', 'provenance'), new Map());
    const html = render(qc, <DepartmentDetail companyId="A" departmentId="d1" />);
    expect(html).toContain('In');
    expect(html).not.toContain('Out');
    const qc2 = client();
    await fail(qc2, companyKeys.org('A', 'department', 'dX'), 404);
    expect(render(qc2, <DepartmentDetail companyId="A" departmentId="dX" />)).toContain('Not found');
  });
  it('query keys are company-partitioned', () => {
    expect(companyKeys.org('A', 'employees')).not.toEqual(companyKeys.org('B', 'employees'));
  });
});
