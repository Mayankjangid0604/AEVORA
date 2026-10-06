'use client';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { COMPANY_DOMAINS } from '@/lib/domains';
import { useDepartments, useEmployees } from '@/lib/org-queries';
import { companyKeys } from '@/lib/query-keys';
import type { AgentView, AssistantMessageView, ChairmanMailView } from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const CHAIRMAN_ONLY = 'Only the Chairman of this company can see this.';

function useSlice10<T>(companyId: string, key: string, path: string) {
  return useQuery({ queryKey: companyKeys.slice10(companyId, key), queryFn: ({ signal }) => bffGet<T>(path, { companyId, signal }) });
}

/** Who wrote a message, as the backend records it. Assistant output is labelled as model-generated. */
const SENDER: Record<string, string> = {
  CHAIRMAN: 'Chairman (human)', ASSISTANT: 'Assistant (AI-generated)', CEO: 'AI CEO', EMPLOYEE: 'Employee', SYSTEM: 'System',
};

export function MessageList({ rows }: { rows: AssistantMessageView[] }) {
  return (
    <ol className="motion-enter divide-y divide-border">
      {rows.map((m) => (
        <li key={m.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium text-text">{SENDER[m.from] ?? m.from}</span>
            <span>to {m.to}</span>
            <StatusBadge status={m.status} />
            <span className="ml-auto"><Timestamp iso={m.createdAt} /></span>
          </div>
          <p className="whitespace-pre-line text-sm text-text">{m.content}</p>
        </li>
      ))}
    </ol>
  );
}

export function AssistantWorkspace({ companyId }: { companyId: string }) {
  const q = useSlice10<AssistantMessageView[]>(companyId, 'assistant', 'assistant/messages');
  return (
    <div className="space-y-6">
      <PageHeader title="Assistant" description="The latest 20 recorded Assistant messages for this company, newest first. Assistant replies are model output, not verified fact. Read-only." />
      <Panel title="Message history" id="assistant-title">
        {q.isPending ? <SectionSkeleton label="assistant messages" />
          : q.isError ? <QueryError error={q.error} forbiddenDetail={CHAIRMAN_ONLY} />
          : q.data.length === 0 ? <SystemState kind="empty" title="No messages" detail="No Assistant message is recorded for this company." />
          : <MessageList rows={q.data} />}
      </Panel>
      <p className="text-xs text-muted">Sending a message runs a model and can act on the company (tasks, outreach, meetings); it is not available in this release.</p>
    </div>
  );
}

export function MailList({ rows }: { rows: ChairmanMailView[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((m) => (
        <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-[min(100%,16rem)] flex-1">
            <p className="text-sm text-text">{!m.read && <span className="sr-only">Unread: </span>}{!m.read && <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-accent" />}{m.title}</p>
            <p className="text-xs text-muted">{m.ref} · {m.category} · system notice{m.messageCount ? ` · ${m.messageCount} message(s) in thread` : ''}</p>
          </div>
          <StatusBadge status={m.status} />
          <span className="text-xs text-muted"><Timestamp iso={m.createdAt} /></span>
        </li>
      ))}
    </ul>
  );
}

export function NotificationsWorkspace({ companyId }: { companyId: string }) {
  const list = useSlice10<ChairmanMailView[]>(companyId, 'mail', 'chairman-mail');
  const unread = useSlice10<{ count: number }>(companyId, 'mail-unread', 'chairman-mail/unread-count');
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Notices AEVORA raised for the Chairman (latest 100). Loaded over ordinary authenticated requests; this page does not update live. Read-only." />
      <p className="text-sm text-text" aria-live="polite">
        {unread.isPending ? 'Counting unread…' : unread.isError ? 'Unread count unavailable.' : `${unread.data.count} unread`}
      </p>
      <Panel title="Chairman notices" id="mail-title">
        {list.isPending ? <SectionSkeleton label="notices" />
          : list.isError ? <QueryError error={list.error} forbiddenDetail={CHAIRMAN_ONLY} />
          : list.data.length === 0 ? <SystemState kind="empty" title="No notices" detail="AEVORA has not raised a notice for the Chairman of this company." />
          : <MailList rows={list.data} />}
      </Panel>
      <p className="text-xs text-muted">Opening a notice marks it read and replying runs the Assistant, so notices cannot be opened or answered here.</p>
    </div>
  );
}

export function WorkerRoster({ companyId }: { companyId: string }) {
  const agents = useSlice10<AgentView[]>(companyId, 'agents', 'agents');
  const employees = useEmployees(companyId);
  const byId = new Map((employees.data ?? []).map((e) => [e.id, e]));
  return (
    <div className="space-y-6">
      <PageHeader title="AI workers" description="Employees that have an AI agent record, with the agent status and autonomy level as recorded. Read-only." />
      <Panel title="Agent roster" id="workers-title">
        {agents.isPending ? <SectionSkeleton label="agents" />
          : agents.isError ? <QueryError error={agents.error} />
          : agents.data.length === 0 ? <SystemState kind="empty" title="No AI workers" detail="No employee of this company has an agent record." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">AI agents of this company</caption>
                <thead className="text-left text-xs text-muted">
                  <tr><th scope="col" className="py-1 pr-3 font-normal">Employee</th><th scope="col" className="pr-3 font-normal">Role</th><th scope="col" className="pr-3 font-normal">Agent status</th><th scope="col" className="pr-3 font-normal">Autonomy</th><th scope="col" className="whitespace-nowrap font-normal">Agent since</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agents.data.map((a) => {
                    const e = byId.get(a.employeeId);
                    return (
                      <tr key={a.id}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                          {e ? <a className="text-accent hover:underline" href={`/company/${encodeURIComponent(companyId)}/organization/workforce/${encodeURIComponent(e.id)}`}>{e.name}</a> : <span className="text-muted">Employee not listed</span>}
                        </th>
                        <td className="pr-3 text-muted">{e?.role?.title ?? '—'}</td>
                        <td className="pr-3"><StatusBadge status={a.status} /></td>
                        <td className="pr-3 text-muted">{a.autonomyLevel}</td>
                        <td className="whitespace-nowrap text-muted"><Timestamp iso={a.createdAt} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      <p className="text-xs text-muted">Running agents and work cycles is not available in this release. Model, provider and instructions are not shown.</p>
    </div>
  );
}

export function AdministrationOverview({ companyId }: { companyId: string }) {
  const departments = useDepartments(companyId);
  const employees = useEmployees(companyId);
  const count = (q: { isPending: boolean; isError: boolean; data?: unknown[] }) => (q.isPending ? '…' : q.isError ? 'Unavailable' : String(q.data!.length));
  const active = employees.data?.filter((e) => e.status === 'ACTIVE').length;
  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="A read-only overview of this company's records and which AEVORA workspaces are available. There are no settings here." />
      <Panel title="Company records" id="records-title">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[['Departments', count(departments)], ['Employees', count(employees)], ['Active employees', active === undefined ? count(employees) : String(active)]].map(([k, v]) => (
            <div key={k} className="rounded-control border border-border p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Workspaces" id="workspaces-title">
        <ul className="divide-y divide-border">
          {COMPANY_DOMAINS.map((d) => (
            <li key={d.slug} className="py-2">
              <p className="text-sm text-text">{d.label} <span className="text-xs text-muted">· {d.status === 'ready' ? 'available' : d.status}</span></p>
              <p className="text-xs text-muted">{d.note}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="text-xs text-muted">Integrations, credentials, model configuration and environment settings are deliberately not shown.</p>
    </div>
  );
}
