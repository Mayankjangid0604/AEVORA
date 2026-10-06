'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import type { ContentPostView, LeadGenRunView, SalesLeadView } from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const CHAIRMAN_ONLY = 'Only the Chairman of this company can see this.';

function useGrowth<T>(companyId: string, key: string, path: string) {
  return useQuery({ queryKey: companyKeys.growth(companyId, key), queryFn: ({ signal }) => bffGet<T>(path, { companyId, signal }) });
}

const Tag = ({ children }: { children: string }) =>
  <span className="whitespace-nowrap rounded-control border border-accent/40 px-1.5 py-0.5 text-[11px] text-accent">{children}</span>;

export function PostList({ rows }: { rows: ContentPostView[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((p) => (
        <li key={p.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>AI-generated (PIXEL)</Tag>
            <StatusBadge status={p.status} />
            <span className="text-xs text-muted">{p.platform} · {p.contentType}</span>
            <span className="ml-auto text-xs text-muted">Created <Timestamp iso={p.createdAt} /></span>
          </div>
          <details className="text-sm text-text">
            <summary className="cursor-pointer truncate">{p.caption.split('\n')[0]}</summary>
            <p className="mt-1 whitespace-pre-line text-xs text-muted">{p.caption}</p>
            {p.hashtags.length > 0 && <p className="mt-1 text-xs text-muted">{p.hashtags.join(' ')}</p>}
          </details>
          {p.postedAt && <p className="text-xs text-muted">Marked as posted by the Chairman <Timestamp iso={p.postedAt} /></p>}
        </li>
      ))}
    </ul>
  );
}

export function MarketingWorkspace({ companyId }: { companyId: string }) {
  const q = useGrowth<ContentPostView[]>(companyId, 'posts', 'marketing-content/posts');
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing" description="Social content posts the PIXEL model drafted for this company (latest 50). Status is recorded as-is; AEVORA does not publish posts itself. Read-only." />
      <Panel title="Content posts" id="posts-title">
        {q.isPending ? <SectionSkeleton label="content posts" />
          : q.isError ? <QueryError error={q.error} forbiddenDetail={CHAIRMAN_ONLY} />
          : q.data.length === 0 ? <SystemState kind="empty" title="No content posts" detail="No content post has been generated for this company." />
          : <PostList rows={q.data} />}
      </Panel>
      <p className="text-xs text-muted">Generating, approving and marking posts call a model or change records; they are not available in this release. No campaign, analytics or conversion data is recorded for this company.</p>
    </div>
  );
}

export function RunList({ rows }: { rows: LeadGenRunView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr><th scope="col" className="py-1 pr-3 font-normal">Started</th><th scope="col" className="pr-3 font-normal">Status</th><th scope="col" className="pr-3 font-normal">Trigger</th><th scope="col" className="pr-3 text-right font-normal">Found</th><th scope="col" className="text-right font-normal">New</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted"><Timestamp iso={r.triggeredAt} /></th>
              <td className="pr-3"><StatusBadge status={r.status} /></td>
              <td className="pr-3 text-muted">{r.triggeredBy}</td>
              <td className="pr-3 text-right tabular-nums">{r.totalFound ?? '—'}</td>
              <td className="text-right tabular-nums">{r.totalNew ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function filterLeads(rows: SalesLeadView[], status: string) {
  return status ? rows.filter((l) => l.status === status) : rows;
}

export function LeadList({ rows }: { rows: SalesLeadView[] }) {
  const [status, setStatus] = useState('');
  const statuses = useMemo(() => [...new Set(rows.map((l) => l.status))].sort(), [rows]);
  const shown = filterLeads(rows, status);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-control border border-border bg-surface px-2 py-1 text-text">
          <option value="">All ({rows.length})</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <ul className="motion-enter divide-y divide-border">
        {shown.map((l) => (
          <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{l.name}</p>
              <p className="text-xs text-muted">{[l.industry, l.geography, l.companySize].filter(Boolean).join(' · ') || 'No details recorded'}</p>
              <p className="text-xs text-muted">
                Source: {l.source ?? 'not recorded'} · {l.lastContactedAt ? <>last contact recorded <Timestamp iso={l.lastContactedAt} /></> : 'no contact recorded'}
              </p>
            </div>
            <StatusBadge status={l.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SalesWorkspace({ companyId }: { companyId: string }) {
  const runs = useGrowth<LeadGenRunView[]>(companyId, 'lead-runs', 'lead-gen/runs');
  const leads = useGrowth<SalesLeadView[]>(companyId, 'leads', 'lead-gen/leads');
  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Lead-generation runs and the leads they found from external business listings. A lead record does not mean the business was contacted. Read-only." />
      <Panel title="Lead-generation runs (latest 50)" id="runs-title">
        {runs.isPending ? <SectionSkeleton label="lead-generation runs" />
          : runs.isError ? <QueryError error={runs.error} />
          : runs.data.length === 0 ? <SystemState kind="empty" title="No runs" detail="Lead generation has not run for this company." />
          : <RunList rows={runs.data} />}
      </Panel>
      <Panel title="Leads (up to 200, as ordered by the backend)" id="leads-title">
        {leads.isPending ? <SectionSkeleton label="leads" />
          : leads.isError ? <QueryError error={leads.error} />
          : leads.data.length === 0 ? <SystemState kind="empty" title="No leads" detail="No externally sourced lead is recorded for this company." />
          : <LeadList rows={leads.data} />}
      </Panel>
      <p className="text-xs text-muted">Contact details are not shown. Outreach, lead-generation runs and status changes are not available in this release. No opportunities or sales activities are recorded for this company.</p>
    </div>
  );
}
