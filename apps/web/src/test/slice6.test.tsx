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
import { TaskDetailView, TaskList, filterTasks } from '@/components/task-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import type { TaskDetail, TaskSummary } from '@/lib/types';

/** Full backend Task row (getTask includes dependencies/dependentOn). */
const backendTask = (id: string, companyId = 'A') => ({
  id, companyId, projectId: 'prj-1', goalId: null, assignedEmployeeId: 'e1', createdBy: 'CREATOR-ACTOR-SECRET',
  title: `Write spec ${id}`, description: 'Real description', priority: 'NORMAL', status: 'REVIEW', progress: 80,
  estimatedEffort: 5, actualEffort: 4, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z',
  startedAt: '2026-10-01T11:00:00.000Z', completedAt: null, dueAt: null, requiredCapability: 'CAPABILITY-SECRET',
  type: 'STANDARD', parentTaskId: null, departmentId: null,
  priorityConfidence: 0.42, priorityModelVersionId: 'MODEL-VERSION-SECRET',
  result: { output: { raw: 'WORKER-OUTPUT-SECRET' }, errors: [] },
  dependencies: [{ id: 'd1', taskId: id, dependsOnId: 'prereq-1' }],
  dependentOn: [{ id: 'd2', taskId: 'next-1', dependsOnId: id }],
});
const LEAK = /CREATOR-ACTOR-SECRET|CAPABILITY-SECRET|MODEL-VERSION-SECRET|WORKER-OUTPUT-SECRET|priorityConfidence|createdBy|companyId|requiredCapability|"result"/;

describe('task projections', () => {
  it('list keeps only display fields and only rows of the selected company', () => {
    const out = projections.employeeTasks([backendTask('t1'), backendTask('t-other', 'B'), { id: 'bad' }], 'A');
    expect(out.map((t) => t.id)).toEqual(['t1']);
    expect(out[0]).toEqual({ id: 't1', title: 'Write spec t1', status: 'REVIEW', priority: 'NORMAL', type: 'STANDARD', progress: 80, dueAt: null,
      createdAt: '2026-10-01T10:00:00.000Z', completedAt: null, assignedEmployeeId: 'e1' });
    expect(JSON.stringify(out)).not.toMatch(LEAK);
  });
  it('detail adds description, effort, links and dependency ids; drops actor, capability, model and result data', () => {
    const d = projections.task(backendTask('t1'), 'A')!;
    expect(JSON.stringify(d)).not.toMatch(LEAK);
    expect(d).toMatchObject({ description: 'Real description', estimatedEffort: 5, projectId: 'prj-1', dependsOn: ['prereq-1'], requiredBy: ['next-1'] });
  });
  it('a task of another company context is not found, even if the backend returned it', () => {
    expect(projections.task(backendTask('t1', 'B'), 'A')).toBeUndefined();
    expect(projections.task(null, 'A')).toBeUndefined();
  });
});

describe('BFF task routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('?')[0]!.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['employees/e1/tasks', 'tasks/t1'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('detail of a task outside the selected company context is 404', async () => {
    reply(200, backendTask('t1', 'B'));
    expect((await call('tasks/t1', { 'x-aevora-company': 'A' })).status).toBe(404);
  });
  it('valid detail forwards X-Company-Id and returns the projection only', async () => {
    reply(200, backendTask('t1'));
    const res = await call('tasks/t1', { 'x-aevora-company': 'A' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    expect(await res.text()).not.toMatch(LEAK);
  });
  it.each([[401], [403], [404]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('employees/eX/tasks', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'tasks', 'tasks/t1/start', 'tasks/t1/complete', 'tasks/t1/assign', 'tasks/t1/priority', 'tasks/t1/block', 'tasks/t1/cancel',
    'agents', 'agents/ag1/executions', 'agents/ag1/run', 'compute/jobs', 'job', 'assistant/pc-tasks', 'employees/e1/goals', 'goals/g1',
    'chairman/projects/p1/tasks', 'operating-loop/A/cycle', // cycles list opened read-only in slice 9
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const task = (id: string, status: string, createdAt: string): TaskSummary =>
  ({ id, title: `T ${id}`, status, priority: 'NORMAL', type: 'STANDARD', progress: null, dueAt: null, createdAt, completedAt: null, assignedEmployeeId: 'e1' });

describe('task rendering', () => {
  const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
    qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:3')), retry: false });

  it('status filter and newest-first order over the returned list', () => {
    const rows = [task('a', 'COMPLETED', '2026-10-01'), task('b', 'REVIEW', '2026-10-03'), task('c', 'COMPLETED', '2026-10-02')];
    expect(filterTasks(rows, '').map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(filterTasks(rows, 'COMPLETED').map((t) => t.id)).toEqual(['c', 'a']);
  });
  it('list: table + cards, recorded progress labelled, unknown progress is a dash (never invented)', () => {
    const html = renderToStaticMarkup(<TaskList rows={[{ ...task('t1', 'REVIEW', '2026-10-01T10:00:00.000Z'), progress: 80 }, task('t2', 'BACKLOG', '2026-10-01T10:00:00.000Z')]} companyId="A" />);
    expect(html).toContain('Progress (recorded)');
    expect(html).toContain('80%');
    expect(html).toContain('—');
    expect(html).toContain('href="/company/A/tasks/t1"');
    expect(html).not.toMatch(/health|risk|confidence|ETA/i);
  });
  it('detail renders real fields, assignee link, project link and dependency links; no actions', () => {
    const qc = client();
    qc.setQueryData(companyKeys.tasks('A', 'detail', 't1'), projections.task(backendTask('t1'), 'A') as TaskDetail);
    qc.setQueryData(companyKeys.org('A', 'employees'), [{ id: 'e1', name: 'Bob', status: 'ACTIVE', hireDate: null, role: null, department: null }]);
    const html = render(qc, <TaskDetailView companyId="A" taskId="t1" />);
    for (const s of ['Write spec t1', 'Real description', 'Bob', 'href="/company/A/tasks?assignee=e1"', 'href="/company/A/projects/prj-1"',
      'href="/company/A/tasks/prereq-1"', 'href="/company/A/tasks/next-1"', '80%', 'Read-only']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
    expect(html).not.toContain('<button');
  });
  it('loading, foreign/missing (404) and forbidden (403) states', async () => {
    expect(render(client(), <TaskDetailView companyId="A" taskId="t1" />)).toContain('Loading task');
    for (const [status, text] of [[404, 'Not found'], [403, 'Access denied'], [503, 'Backend unavailable']] as const) {
      const qc = client();
      await fail(qc, companyKeys.tasks('A', 'detail', 'tX'), status);
      const html = render(qc, <TaskDetailView companyId="A" taskId="tX" />);
      expect(html).toContain(text);
      expect(html).toContain('Back to tasks');
      expect(html).not.toContain('stack.ts');
    }
  });
  it('task keys are company-partitioned', () => {
    expect(companyKeys.tasks('A', 'assignee', 'e1')).not.toEqual(companyKeys.tasks('B', 'assignee', 'e1'));
  });
});
