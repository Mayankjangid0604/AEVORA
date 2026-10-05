import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanySelector } from '@/components/company-selector';
import { ActivityList, AttentionList, DecisionList, OverviewFigures } from '@/components/chairman-sections';
import { QueryError } from '@/components/query-state';
import { selectionOutcome } from '@/lib/company-selection';
import { companyKeys } from '@/lib/query-keys';
import { commandEntries, companyFromPath } from '@/lib/navigation';
import { ApiError } from '@/lib/http';
import type { AccessibleCompany, ChairmanOverview, CompanyEvent, ManagementDecision, OperationalAlert } from '@/lib/types';

const co = (id: string, name: string): AccessibleCompany => ({ id, name, status: 'ACTIVE', groupId: null });

describe('company selection', () => {
  it('renders exactly the companies the backend returned, linking by their ids', () => {
    const html = renderToStaticMarkup(<CompanySelector companies={[co('c-1', 'Alpha Ltd'), co('c-2', 'Beta Ltd')]} />);
    expect(html).toContain('Alpha Ltd');
    expect(html).toContain('Beta Ltd');
    expect(html.match(/href="\/company\/[^"]+"/g)).toEqual(['href="/company/c-1"', 'href="/company/c-2"']);
  });
  it('empty list -> none (no fallback company); one -> enter that id; many -> choose', () => {
    expect(selectionOutcome([])).toEqual({ kind: 'none' });
    expect(selectionOutcome([co('only', 'X')])).toEqual({ kind: 'enter', companyId: 'only' });
    expect(selectionOutcome([co('a', 'A'), co('b', 'B')]).kind).toBe('choose');
  });
  it('an empty selector renders no company link', () => {
    expect(renderToStaticMarkup(<CompanySelector companies={[]} />)).not.toContain('href=');
  });
});

describe('company context in query keys and navigation', () => {
  it('chairman query keys are partitioned by company', () => {
    expect(companyKeys.chairman('A', 'overview')).toEqual(['company', 'A', 'chairman', 'overview']);
    expect(companyKeys.chairman('A', 'overview')).not.toEqual(companyKeys.chairman('B', 'overview'));
  });
  it('company id is read from the URL only when well-formed', () => {
    expect(companyFromPath('/company/abc-1/ceo')).toBe('abc-1');
    expect(companyFromPath('/company/..%2F/x')).toBeNull();
    expect(companyFromPath('/attention')).toBeNull();
  });
  it('command entries include company destinations only inside a company context', () => {
    expect(commandEntries('/').some((e) => e.href.startsWith('/company/'))).toBe(false);
    const inCo = commandEntries('/company/A');
    expect(inCo.map((e) => e.href)).toContain('/company/A');
    expect(inCo.map((e) => e.href)).toContain('/company/A/ceo');
  });
});

describe('Chairman Home sections render backend data only', () => {
  const overview: ChairmanOverview = { company: { id: 'A', name: 'Alpha', status: 'ACTIVE' }, employees: { total: 12, active: 9 }, projects: { total: 4, active: 3 }, alerts: 2, pendingDecisions: 1 };
  it('overview shows the returned counts and nothing else', () => {
    const html = renderToStaticMarkup(<OverviewFigures data={overview} />);
    for (const v of ['12', '9 active', '4', '3 active', '>2<', '>1<']) expect(html).toContain(v);
    expect(html).not.toMatch(/₹|\$|revenue|treasury/i);
  });
  it('attention lists only ACTIVE alerts, empty state otherwise', () => {
    const alerts: OperationalAlert[] = [
      { id: '1', severity: 'CRITICAL', category: 'finance', title: 'Cash low', description: null, status: 'ACTIVE', createdAt: '2026-10-01T10:00:00Z' },
      { id: '2', severity: 'INFO', category: 'ops', title: 'Old resolved', description: null, status: 'RESOLVED', createdAt: '2026-10-01T09:00:00Z' },
    ];
    const html = renderToStaticMarkup(<AttentionList alerts={alerts} />);
    expect(html).toContain('Cash low');
    expect(html).not.toContain('Old resolved');
    expect(renderToStaticMarkup(<AttentionList alerts={[]} />)).toContain('Nothing needs attention');
  });
  it('decisions list only PROPOSED, offers no action controls, empty state otherwise', () => {
    const decisions: ManagementDecision[] = [
      { id: 'd1', type: 'HIRE', title: 'Hire analyst', status: 'PROPOSED', createdAt: '2026-10-01T10:00:00Z', proposer: { id: 'e', name: 'CEO Agent' } },
      { id: 'd2', type: 'FIRE', title: 'Done already', status: 'APPROVED', createdAt: '2026-10-01T10:00:00Z', proposer: null },
    ];
    const html = renderToStaticMarkup(<DecisionList decisions={decisions} />);
    expect(html).toContain('Hire analyst');
    expect(html).toContain('proposed by CEO Agent');
    expect(html).not.toContain('Done already');
    expect(html).not.toContain('<button');
    expect(renderToStaticMarkup(<DecisionList decisions={[]} />)).toContain('No pending decisions');
  });
  it('activity shows event types and an empty state', () => {
    const events: CompanyEvent[] = [{ id: 'e1', type: 'EMPLOYEE_HIRED', createdAt: '2026-10-01T10:00:00Z' }];
    expect(renderToStaticMarkup(<ActivityList events={events} />)).toContain('EMPLOYEE_HIRED');
    expect(renderToStaticMarkup(<ActivityList events={[]} />)).toContain('No recorded activity');
  });
  it('limits are disclosed, never silently truncated', () => {
    const many: CompanyEvent[] = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, type: `T${i}`, createdAt: '2026-10-01T10:00:00Z' }));
    const alerts = many.map((e) => ({ id: e.id, severity: 'INFO' as const, category: 'c', title: e.type, description: null, status: 'ACTIVE', createdAt: e.createdAt }));
    expect(renderToStaticMarkup(<AttentionList alerts={alerts} limit={2} />)).toContain('Showing 2 of 3 active alerts');
  });
});

describe('error states', () => {
  it.each([
    [401, 'Session ended'], [403, 'Access denied'], [404, 'Not found'], [409, 'State changed'],
    [400, 'Request rejected'], [422, 'Request rejected'], [503, 'Backend unavailable'], [500, 'Something went wrong'],
  ])('%i renders fixed copy, never the backend message', (status, title) => {
    const html = renderToStaticMarkup(<QueryError error={new ApiError(status, 'at Prisma.findMany (/srv/secret.ts:42) stack')} />);
    expect(html).toContain(title);
    expect(html).not.toContain('secret.ts');
  });
  it('403 can carry a role explanation', () => {
    expect(renderToStaticMarkup(<QueryError error={new ApiError(403, 'x')} forbiddenDetail="Chairman only." />)).toContain('Chairman only.');
  });
  it('a non-ApiError is a generic error', () => {
    expect(renderToStaticMarkup(<QueryError error={new TypeError('boom')} />)).toContain('Something went wrong');
  });
});
