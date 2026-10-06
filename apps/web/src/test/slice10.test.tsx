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
import { AdministrationOverview, AssistantWorkspace, NotificationsWorkspace, WorkerRoster } from '@/components/slice10-views';
import { companyKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { COMPANY_DOMAINS, OS_DOMAINS } from '@/lib/domains';
import { commandEntries } from '@/lib/navigation';

const msg = (id: string, from: string, companyId = 'A') => ({
  id, companyId, groupId: null, from, to: from === 'CHAIRMAN' ? 'ASSISTANT' : 'CHAIRMAN', content: `Text ${id}`,
  intent: { action: 'INTENT-SECRET' }, result: { raw: 'RESULT-SECRET' }, status: 'DONE', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: 'x',
});
const mail = (id: string, readAt: string | null) => ({
  id, ref: `AEV-${id}`, category: 'FINANCE', title: `Notice ${id}`, status: 'OPEN', readAt, createdAt: '2026-10-01T10:00:00.000Z', event: 'cash.low',
  _count: { messages: 2 }, body: 'BODY-SECRET', data: { raw: 'DATA-SECRET' }, emailMessageId: 'EMAILID-SECRET',
});
const agent = (id: string, employeeId: string) => ({
  id, employeeId, status: 'ACTIVE', autonomyLevel: 'ASSISTED', budget: { limit: 'BUDGET-SECRET' },
  configuration: { provider: 'PROVIDER-SECRET', model: 'MODEL-SECRET', systemInstructions: 'PROMPT-SECRET' }, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: 'x',
});
const LEAK = /SECRET|companyId|intent|"result"|"body"|"data"|emailMessageId|configuration|budget|systemInstructions/;

describe('slice 10 projections', () => {
  it('assistant drops intent/result JSON and other-company rows', () => {
    const out = projections.assistantMessages([msg('m1', 'CHAIRMAN'), msg('m2', 'ASSISTANT', 'B')], 'A');
    expect(out).toEqual([{ id: 'm1', from: 'CHAIRMAN', to: 'ASSISTANT', content: 'Text m1', status: 'DONE', createdAt: '2026-10-01T10:00:00.000Z' }]);
  });
  it('mail keeps list fields and a real read flag; drops body/data/email ids', () => {
    const out = projections.chairmanMail([mail('1', null), mail('2', '2026-10-02T00:00:00.000Z')]);
    expect(out.map((m) => [m.ref, m.read, m.messageCount])).toEqual([['AEV-1', false, 2], ['AEV-2', true, 2]]);
    expect(JSON.stringify(out)).not.toMatch(LEAK);
    expect(projections.unreadCount({ count: 3, extra: 'x' })).toEqual({ count: 3 });
    expect(projections.unreadCount({})).toBeUndefined();
  });
  it('agents drop configuration (provider, model, prompt) and budget', () => {
    const out = projections.agents([agent('a1', 'e1'), { id: 'bad' }]);
    expect(out).toEqual([{ id: 'a1', employeeId: 'e1', status: 'ACTIVE', autonomyLevel: 'ASSISTED', createdAt: '2026-10-01T10:00:00.000Z' }]);
    expect(JSON.stringify(out)).not.toMatch(LEAK);
  });
});

describe('slice 10 BFF routes', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const call = (path: string, headers: Record<string, string> = {}) =>
    bff(new NextRequest(`http://localhost:3000/api/bff/${path}`, { headers }), { params: Promise.resolve({ path: path.split('/') }) });
  beforeEach(() => { jar.clear(); jar.set(SESSION_COOKIE, 'jwt'); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['assistant/messages', 'chairman-mail', 'chairman-mail/unread-count', 'agents'])('%s requires an explicit company', async (p) => {
    expect((await call(p)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('agents forward X-Company-Id and return the projection only', async () => {
    reply(200, [agent('a1', 'e1')]);
    const res = await call('agents', { 'x-aevora-company': 'A' });
    expect(fetchMock.mock.calls[0]![1].headers['X-Company-Id']).toBe('A');
    expect(await res.text()).not.toMatch(LEAK);
  });
  it.each([[401], [403]])('backend %i is preserved', async (status) => {
    reply(status, { message: 'm' });
    expect((await call('chairman-mail', { 'x-aevora-company': 'A' })).status).toBe(status);
  });
  it.each([
    'assistant/message', 'assistant/voice/transcribe', 'assistant/pc-tasks', 'v12-assistant/ask', 'voice/command',
    'chairman-mail/m1', 'chairman-mail/m1/reply', 'chairman-mail/m1/close', 'chairman-mail/check-replies',
    'chairman/communication/notifications', 'agents/a1', 'agents/a1/executions', 'agents/a1/run', 'agents/a1/work-cycle', 'agents/schedule-work-cycles',
    'groups/g1/report', 'model-platform/providers', 'model-platform/models', 'socket.io', 'realtime',
  ])('%s stays blocked (404, no backend call)', async (p) => {
    expect((await call(p, { 'x-aevora-company': 'A' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
const fail = (qc: QueryClient, key: readonly unknown[], status: number) =>
  qc.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new ApiError(status, 'stack.ts:1')), retry: false });
const employees = [{ id: 'e1', name: 'Nova', status: 'ACTIVE', hireDate: null, role: { title: 'Engineer' }, department: null }];

describe('slice 10 rendering', () => {
  it('Assistant: sender provenance (human vs AI-generated), no send control', () => {
    const qc = client();
    qc.setQueryData(companyKeys.slice10('A', 'assistant'), projections.assistantMessages([msg('m1', 'CHAIRMAN'), msg('m2', 'ASSISTANT')], 'A'));
    const html = render(qc, <AssistantWorkspace companyId="A" />);
    for (const s of ['Chairman (human)', 'Assistant (AI-generated)', 'Text m2', 'not verified fact']) expect(html).toContain(s);
    expect(html).not.toMatch(/<button|<textarea|<input/);
  });
  it('Notifications: real unread count, unread marker announced, no fake realtime', () => {
    const qc = client();
    qc.setQueryData(companyKeys.slice10('A', 'mail'), projections.chairmanMail([mail('1', null), mail('2', 'x')]));
    qc.setQueryData(companyKeys.slice10('A', 'mail-unread'), { count: 1 });
    const html = render(qc, <NotificationsWorkspace companyId="A" />);
    for (const s of ['1 unread', 'Unread: </span>', 'Notice 2', 'does not update live']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
  });
  it('Workers: roster joins agent records to employees; no model/provider data', () => {
    const qc = client();
    qc.setQueryData(companyKeys.slice10('A', 'agents'), projections.agents([agent('a1', 'e1'), agent('a2', 'eX')]));
    qc.setQueryData(companyKeys.org('A', 'employees'), employees);
    const html = render(qc, <WorkerRoster companyId="A" />);
    for (const s of ['Nova', 'Engineer', 'ASSISTED', 'Employee not listed', '<th scope="col"', 'href="/company/A/organization/workforce/e1"']) expect(html).toContain(s);
    expect(html).not.toMatch(LEAK);
  });
  it('Administration: counts from returned records and the registry; no settings', () => {
    const qc = client();
    qc.setQueryData(companyKeys.org('A', 'departments'), [{ id: 'd1', name: 'Eng', status: 'ACTIVE' }]);
    qc.setQueryData(companyKeys.org('A', 'employees'), employees);
    const html = render(qc, <AdministrationOverview companyId="A" />);
    for (const s of ['Departments', '>1<', 'AI workers', 'available']) expect(html).toContain(s);
    expect(html).not.toMatch(/<input|<button|api key|password|DATABASE_URL/i);
  });
  it('loading, empty, forbidden and unavailable states', async () => {
    expect(render(client(), <AssistantWorkspace companyId="A" />)).toContain('Loading');
    const empty = client();
    empty.setQueryData(companyKeys.slice10('A', 'agents'), []);
    expect(render(empty, <WorkerRoster companyId="A" />)).toContain('No AI workers');
    for (const [status, text] of [[403, 'Access denied'], [503, 'Backend unavailable']] as const) {
      const qc = client();
      await fail(qc, companyKeys.slice10('A', 'mail'), status);
      const html = render(qc, <NotificationsWorkspace companyId="A" />);
      expect(html).toContain(text);
      expect(html).not.toContain('stack.ts');
    }
  });
});

describe('navigation: no placeholders, no dead links', () => {
  it('every company domain is ready and every navigation entry is a built page', async () => {
    expect(COMPANY_DOMAINS.every((d) => d.status === 'ready')).toBe(true);
    expect(OS_DOMAINS).toEqual([]);
    const fs = await import('node:fs');
    for (const d of COMPANY_DOMAINS) {
      expect(fs.existsSync(`src/app/(os)/company/[companyId]/${d.slug}/page.tsx`), d.slug).toBe(true);
    }
    expect(commandEntries('/company/A').map((e) => e.href)).toEqual(expect.arrayContaining(['/company/A/assistant', '/company/A/workers']));
  });
});
