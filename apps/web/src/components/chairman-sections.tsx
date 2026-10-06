import type { ReactNode } from 'react';
import type { ChairmanOverview, CompanyEvent, ManagementDecision, OperationalAlert } from '@/lib/types';
import { SystemState } from './system-state';

/** Presentational Chairman Home sections. They render only what the backend returned; nothing is derived or invented. */

const dateFmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : <time dateTime={iso} className="whitespace-nowrap text-xs text-muted">{dateFmt.format(d)}</time>;
}

/** level: 2 directly under the company h1 (Home); 3 inside a workspace whose PageHeader is the h2. */
export function Panel({ title, id, children, action, level = 3 }: { title: string; id: string; children: ReactNode; action?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={id} className="rounded-panel border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <H id={id} className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</H>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Counts from GET /chairman/overview, labelled exactly as the backend computes them. */
export function OverviewFigures({ data }: { data: ChairmanOverview }) {
  const figures: { label: string; value: number; detail: string }[] = [
    { label: 'Employees', value: data.employees.total, detail: `${data.employees.active} active` },
    { label: 'Projects', value: data.projects.total, detail: `${data.projects.active} active, planned or in review` },
    { label: 'Active alerts', value: data.alerts, detail: 'operational alerts with status ACTIVE' },
    { label: 'Pending decisions', value: data.pendingDecisions, detail: 'management decisions PROPOSED' },
  ];
  return (
    <dl className="motion-enter grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="rounded-panel border border-border bg-surface p-4">
          <dt className="text-xs text-muted">{f.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-text">{f.value}</dd>
          <dd className="mt-0.5 text-xs text-muted">{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

const SEVERITY: Record<OperationalAlert['severity'], string> = {
  CRITICAL: 'bg-danger-soft text-danger',
  WARNING: 'bg-warn-soft text-warn',
  INFO: 'bg-accent-soft text-accent',
};

export function AttentionList({ alerts, limit = 8 }: { alerts: OperationalAlert[]; limit?: number }) {
  const active = alerts.filter((a) => a.status === 'ACTIVE');
  if (active.length === 0) return <SystemState kind="empty" title="Nothing needs attention" detail="The backend reports no active operational alerts." />;
  return (
    <>
      <ul className="motion-enter divide-y divide-border">
        {active.slice(0, limit).map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={`mt-0.5 shrink-0 rounded-control px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY[a.severity] ?? SEVERITY.INFO}`}>{a.severity}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{a.title}</p>
              <p className="text-xs text-muted">{a.category}</p>
            </div>
            <When iso={a.createdAt} />
          </li>
        ))}
      </ul>
      {active.length > limit && <p className="mt-3 text-xs text-muted">Showing {limit} of {active.length} active alerts.</p>}
    </>
  );
}

export function DecisionList({ decisions, limit = 6 }: { decisions: ManagementDecision[]; limit?: number }) {
  const pending = decisions.filter((d) => d.status === 'PROPOSED');
  if (pending.length === 0) return <SystemState kind="empty" title="No pending decisions" detail="No management decision is awaiting the Chairman." />;
  return (
    <>
      <ul className="motion-enter divide-y divide-border">
        {pending.slice(0, limit).map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm text-text">{d.title}</p>
              <p className="text-xs text-muted">{d.type}{d.proposer ? ` · proposed by ${d.proposer.name}` : ''}</p>
            </div>
            <When iso={d.createdAt} />
          </li>
        ))}
      </ul>
      {pending.length > limit && <p className="mt-3 text-xs text-muted">Showing {limit} of {pending.length} pending decisions.</p>}
      <p className="mt-3 text-xs text-muted">Approving and rejecting decisions is not available in this release.</p>
    </>
  );
}

export function ActivityList({ events, limit = 10 }: { events: CompanyEvent[]; limit?: number }) {
  if (events.length === 0) return <SystemState kind="empty" title="No recorded activity" detail="The backend has no company events yet." />;
  return (
    <ol className="motion-enter space-y-2">
      {events.slice(0, limit).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate font-mono text-xs text-text">{e.type}</span>
          <When iso={e.createdAt} />
        </li>
      ))}
    </ol>
  );
}
