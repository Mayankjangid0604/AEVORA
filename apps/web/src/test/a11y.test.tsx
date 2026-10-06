// @vitest-environment jsdom
/**
 * Automated accessibility (axe-core) over the rendered Company OS workspaces with real projection shapes.
 * jsdom has no layout engine, so colour-contrast is checked in the live browser instead (see the Slice 10 report).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import axe from 'axe-core';
import { companyKeys } from '@/lib/query-keys';
import { projections } from '@/server/projections';
import { AdministrationOverview, AssistantWorkspace, NotificationsWorkspace, WorkerRoster } from '@/components/slice10-views';
import { OperationsWorkspace, CycleDetail } from '@/components/operations-views';
import { MarketingWorkspace, SalesWorkspace } from '@/components/growth-views';
import { AttentionWorkspace, CeoWorkspace, DecisionsWorkspace } from '@/components/ceo-views';
import { TaskList } from '@/components/task-views';
import { ProjectList } from '@/components/project-views';

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
const emp = [{ id: 'e1', name: 'Nova', status: 'ACTIVE', hireDate: null, role: { title: 'Engineer' }, department: null }];
const at = '2026-10-01T10:00:00.000Z';

function seeded() {
  const c = qc();
  c.setQueryData(companyKeys.org('A', 'employees'), emp);
  c.setQueryData(companyKeys.org('A', 'departments'), [{ id: 'd1', name: 'Eng', status: 'ACTIVE' }]);
  c.setQueryData(companyKeys.slice10('A', 'assistant'), [{ id: 'm1', from: 'ASSISTANT', to: 'CHAIRMAN', content: 'Hi', status: 'DONE', createdAt: at }]);
  c.setQueryData(companyKeys.slice10('A', 'mail'), [{ id: 'n1', ref: 'AEV-1', event: 'e', category: 'C', title: 'Notice', status: 'OPEN', read: false, createdAt: at, messageCount: 0 }]);
  c.setQueryData(companyKeys.slice10('A', 'mail-unread'), { count: 1 });
  c.setQueryData(companyKeys.slice10('A', 'agents'), [{ id: 'a1', employeeId: 'e1', status: 'ACTIVE', autonomyLevel: 'ASSISTED', createdAt: at }]);
  const cyc = { id: 'c1', companyId: 'A', phase: 'COMPLETE', trigger: 'scheduled_business_loop', recommendation: { title: 'Continue', impact: 'LOW', effort: 'LOW', risk: 'LOW' }, execution: { dispatched: false, result: 'no matching dispatcher' }, startedAt: at, completedAt: at, error: null };
  c.setQueryData(companyKeys.operations('A', 'cycles'), projections.operatingCycles([cyc], 'A'));
  c.setQueryData(companyKeys.operations('A', 'cycle', 'c1'), projections.operatingCycle(cyc, 'A'));
  c.setQueryData(companyKeys.growth('A', 'posts'), [{ id: 'p1', platform: 'INSTAGRAM', contentType: 'TIP', caption: 'Hello', hashtags: ['#a'], status: 'DRAFT', scheduledFor: null, postedAt: null, createdAt: at }]);
  c.setQueryData(companyKeys.growth('A', 'lead-runs'), [{ id: 'r1', status: 'COMPLETED', triggeredBy: 'SCHEDULE', triggeredAt: at, completedAt: at, totalFound: 3, totalNew: 1 }]);
  c.setQueryData(companyKeys.growth('A', 'leads'), [{ id: 'l1', name: 'Biz', industry: null, geography: null, companySize: null, status: 'NEW', source: null, createdAt: at, lastContactedAt: null }]);
  c.setQueryData(companyKeys.ceo('A', 'feed'), [{ id: 'f1', at, kind: 'REVIEW', outcome: null, title: 'Review', detail: 'x' }]);
  c.setQueryData(companyKeys.ceo('A', 'questions'), [{ id: 'q1', question: 'Q?', urgency: 'HIGH', status: 'OPEN', askedAt: at, answeredAt: null, chairmanAnswer: null }]);
  c.setQueryData(companyKeys.chairman('A', 'decisions'), [{ id: 'd1', type: 'HIRE', title: 'Hire', status: 'PROPOSED', createdAt: at, proposer: null, description: null, updatedAt: null, approvedAt: null, targetEmployee: null }]);
  c.setQueryData(companyKeys.chairman('A', 'alerts'), []);
  return c;
}

/** Each workspace is wrapped in the same landmark the OS shell provides (<main>), as a full page. */
async function violations(node: ReactNode, client = seeded()) {
  document.documentElement.lang = 'en';
  document.title = 'AEVORA';
  document.body.innerHTML = `<main>${renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>)}</main>`;
  const r = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const pages: [string, ReactNode][] = [
  ['assistant', <AssistantWorkspace key="1" companyId="A" />],
  ['notifications', <NotificationsWorkspace key="2" companyId="A" />],
  ['workers', <WorkerRoster key="3" companyId="A" />],
  ['administration', <AdministrationOverview key="4" companyId="A" />],
  ['operations', <OperationsWorkspace key="5" companyId="A" />],
  ['operations detail', <CycleDetail key="6" companyId="A" cycleId="c1" />],
  ['marketing', <MarketingWorkspace key="7" companyId="A" />],
  ['sales', <SalesWorkspace key="8" companyId="A" />],
  ['ceo', <CeoWorkspace key="9" companyId="A" />],
  ['decisions', <DecisionsWorkspace key="10" companyId="A" />],
  ['attention', <AttentionWorkspace key="11" companyId="A" />],
  ['tasks list', <TaskList key="12" rows={[{ id: 't1', title: 'T', status: 'TODO', priority: 'NORMAL', type: 'STANDARD', progress: null, dueAt: null, createdAt: at, completedAt: null, assignedEmployeeId: 'e1' }]} companyId="A" />],
  ['projects list', <ProjectList key="13" rows={[{ id: 'p1', name: 'P', description: null, type: 'WEBSITE', status: 'ACTIVE', startDate: null, targetEndDate: null, client: null, assignmentCount: 0 }]} companyId="A" />],
];

describe('axe: no accessibility violations', () => {
  it.each(pages)('%s (with data)', async (_, node) => {
    expect(await violations(node)).toEqual([]);
  });
  it.each(pages.slice(0, 6))('%s (loading state)', async (_, node) => {
    expect(await violations(node, qc())).toEqual([]);
  });
  it('under the company layout h1, workspaces add no h1 and headings do not skip levels', () => {
    for (const [name, node] of pages.slice(0, 11)) {
      // The company layout renders the company name as the page's only h1 above every workspace.
      document.body.innerHTML = `<h1>Company</h1>${renderToStaticMarkup(<QueryClientProvider client={seeded()}>{node}</QueryClientProvider>)}`;
      expect(document.querySelectorAll('h1').length, name).toBe(1);
      const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
      levels.forEach((l, i) => { if (i) expect(l - levels[i - 1]!, name).toBeLessThanOrEqual(1); });
    }
  });
});
