'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { ApiError } from '@/lib/http';
import { companyKeys } from '@/lib/query-keys';
import { useEmployees } from '@/lib/org-queries';
import type { AssistanceRequestView, DecisionProposalView, IntelligenceSessionView, IntelligenceSummary } from '@/lib/types';
import { DetailList, PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const enc = encodeURIComponent;
const base = (companyId: string) => `/company/${enc(companyId)}/intelligence`;

/** Absolute timestamps in the viewer's timezone, with the zone named. Never relative ("5 minutes ago"). */
const tsFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export function Timestamp({ iso }: { iso: string | null | undefined }) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? <time dateTime={iso!}>{tsFmt.format(d)}</time> : <span className="text-muted">Not recorded</span>;
}

const METRIC_LABEL: Record<string, string> = { totalEmployees: 'Employees', activeProjects: 'Active projects' };

function useIntel<T>(companyId: string, key: string[], path: string) {
  return useQuery({ queryKey: companyKeys.intelligence(companyId, ...key), queryFn: ({ signal }) => bffGet<T>(path, { companyId, signal }) });
}
export const useIntelligenceSummary = (companyId: string) =>
  useIntel<IntelligenceSummary>(companyId, ['summary'], `company-intelligence/company/${enc(companyId)}`);
export const useProposals = (companyId: string) =>
  useIntel<DecisionProposalView[]>(companyId, ['proposals'], `intelligence/company/${enc(companyId)}/proposals`);
export const useAssistanceRequests = (companyId: string) =>
  useIntel<AssistanceRequestView[]>(companyId, ['assistance'], `intelligence/company/${enc(companyId)}/assistance-requests`);
export const useSession = (companyId: string, id: string) =>
  useIntel<IntelligenceSessionView>(companyId, ['session', id], `intelligence/sessions/${enc(id)}`);

function Bullets({ items, empty }: { items: { key: string; node: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm text-text">{items.map((i) => <li key={i.key}>{i.node}</li>)}</ul>;
}

/** The backend's computed company summary. Provenance = the source names and their snapshot timestamps it reports. */
export function SummaryPanel({ data }: { data: IntelligenceSummary }) {
  return (
    <div className="motion-enter space-y-4">
      <p className="text-xs text-muted">
        Computed by AEVORA from current company records at <Timestamp iso={data.generatedAt} />. No model was run to produce it.
      </p>
      {data.metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.metrics.map((m) => (
            <div key={m.key} className="rounded-control border border-border p-3">
              <dt className="text-xs text-muted">{METRIC_LABEL[m.key] ?? m.key}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="facts-h"><h3 id="facts-h" className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Facts</h3>
          <Bullets items={data.facts.map((f, i) => ({ key: `f${i}`, node: <>{f.statement}{f.source && <span className="text-muted"> (source: {f.source})</span>}</> }))} empty="No facts reported." />
        </section>
        <section aria-labelledby="risks-h"><h3 id="risks-h" className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Risks</h3>
          <Bullets items={data.risks.map((r, i) => ({ key: `r${i}`, node: <>{r.title}{r.count !== null && <span className="text-muted"> ({r.count})</span>}</> }))} empty="The backend reports no risks." />
        </section>
        <section aria-labelledby="opps-h"><h3 id="opps-h" className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Opportunities</h3>
          <Bullets items={data.opportunities.map((o, i) => ({ key: `o${i}`, node: <>{o.title}{o.count !== null && <span className="text-muted"> ({o.count})</span>}</> }))} empty="The backend reports no opportunities." />
        </section>
        <section aria-labelledby="trends-h"><h3 id="trends-h" className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Trends</h3>
          <Bullets items={data.trends.map((t, i) => ({ key: `t${i}`, node: <>{t.title}{t.description && <span className="text-muted"> — {t.description}</span>}</> }))} empty="The backend reports no trends." />
        </section>
      </div>
      {data.missingData.length > 0 && (
        <section aria-labelledby="missing-h" className="rounded-control border border-border bg-warn-soft/40 p-3">
          <h3 id="missing-h" className="mb-1 text-xs font-semibold uppercase tracking-wider text-warn">Missing data</h3>
          <Bullets items={data.missingData.map((m, i) => ({ key: `m${i}`, node: m }))} empty="" />
        </section>
      )}
      {data.sources.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Sources ({data.sources.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4">{data.sources.map((s) => <li key={s.name}>{s.name}: as of <Timestamp iso={s.asOf} /></li>)}</ul>
        </details>
      )}
    </div>
  );
}

export function ProposalList({ rows, companyId }: { rows: DecisionProposalView[]; companyId: string }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {[...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="min-w-0">
            <Link href={`${base(companyId)}/proposals/${enc(p.id)}`} className="block truncate text-sm font-medium text-text hover:text-accent">{p.title}</Link>
            <span className="text-xs text-muted">Impact {p.impactLevel} · confidence {p.confidence} (as recorded) · <Timestamp iso={p.createdAt} /></span>
          </span>
          <StatusBadge status={p.status} />
        </li>
      ))}
    </ul>
  );
}

export function AssistanceList({ rows }: { rows: AssistanceRequestView[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {[...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="min-w-0">
            <span className="block text-sm text-text">{r.question}</span>
            <span className="text-xs text-muted">Urgency {r.urgency} · <Timestamp iso={r.createdAt} /></span>
          </span>
          <StatusBadge status={r.status} />
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceOverview({ companyId }: { companyId: string }) {
  const summary = useIntelligenceSummary(companyId);
  const proposals = useProposals(companyId);
  const assistance = useAssistanceRequests(companyId);
  return (
    <div className="space-y-6">
      <PageHeader title="Intelligence" description="What AEVORA currently knows about this company, from persisted records and current company state. Read-only." />
      <Panel title="Company summary" id="summary-title">
        {summary.isPending ? <SectionSkeleton label="company summary" />
          : summary.isError ? <QueryError error={summary.error} />
          : <SummaryPanel data={summary.data} />}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Decision proposals" id="proposals-title">
          {proposals.isPending ? <SectionSkeleton label="proposals" />
            : proposals.isError ? <QueryError error={proposals.error} />
            : proposals.data.length === 0 ? <SystemState kind="empty" title="No decision proposals" detail="No intelligence session has produced a decision proposal for this company." />
            : <ProposalList rows={proposals.data} companyId={companyId} />}
        </Panel>
        <Panel title="Assistance requests" id="assistance-title">
          {assistance.isPending ? <SectionSkeleton label="assistance requests" />
            : assistance.isError ? <QueryError error={assistance.error} />
            : assistance.data.length === 0 ? <SystemState kind="empty" title="No assistance requests" detail="No employee has asked for assistance through AEVORA intelligence." />
            : <AssistanceList rows={assistance.data} />}
        </Panel>
      </div>
    </div>
  );
}

/** Proposal detail, resolved from the company-scoped proposal list (no by-id proposal endpoint exists). */
export function ProposalDetail({ companyId, proposalId }: { companyId: string; proposalId: string }) {
  const proposals = useProposals(companyId);
  const employees = useEmployees(companyId);
  const crumbs = [{ href: base(companyId), label: 'Intelligence' }, { label: 'Decision proposal' }];
  if (proposals.isPending) return <SectionSkeleton rows={4} label="proposal" />;
  const p = proposals.data?.find((x) => x.id === proposalId);
  if (proposals.isError || !p) {
    return (
      <div className="space-y-3">
        <PageHeader title="Decision proposal" crumbs={crumbs} />
        {proposals.isError ? <QueryError error={proposals.error} /> : <SystemState kind="not_found" />}
        <Link href={base(companyId)} className="text-sm text-accent hover:underline">Back to intelligence</Link>
      </div>
    );
  }
  const proposer = p.proposerId ? employees.data?.find((e) => e.id === p.proposerId) : undefined;
  return (
    <div className="space-y-4">
      <PageHeader title={p.title} crumbs={[crumbs[0]!, { label: p.title }]}><StatusBadge status={p.status} label="Proposal status" /></PageHeader>
      <section aria-label="Proposal details" className="motion-enter space-y-4 rounded-panel border border-border bg-surface p-4">
        <DetailList items={[
          { label: 'Impact level (as recorded)', value: p.impactLevel },
          { label: 'Confidence (as recorded)', value: p.confidence },
          { label: 'Raised by', value: proposer
            ? <Link href={`/company/${enc(companyId)}/organization/workforce/${enc(proposer.id)}`} className="text-accent hover:underline">{proposer.name}</Link>
            : 'Employee record not available' },
          { label: 'Created', value: <Timestamp iso={p.createdAt} /> },
        ]} />
        {[['Problem', p.problem], ['Recommendation', p.recommendation], ['Rationale', p.rationale]].map(([label, text]) => (
          <div key={label}><h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</h3><p className="mt-1 whitespace-pre-line text-sm text-text">{text || 'Not recorded'}</p></div>
        ))}
        {p.sessionId && <Link href={`${base(companyId)}/sessions/${enc(p.sessionId)}`} className="inline-block text-sm text-accent hover:underline">Open the intelligence session</Link>}
      </section>
      <Panel title="Options" id="options-title">
        {p.options.length === 0 ? <p className="text-sm text-muted">No options recorded.</p> : (
          <ul className="divide-y divide-border">{p.options.map((o) => (
            <li key={o.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-text">{o.title}</p>
              <p className="text-sm text-muted">{o.description}</p>
              <p className="text-xs text-muted">Effort {o.estimatedEffort ?? 'not recorded'} · impact {o.estimatedImpact ?? 'not recorded'}{o.score !== null ? ` · score ${o.score} (as recorded)` : ''}</p>
            </li>
          ))}</ul>
        )}
      </Panel>
      <Panel title="Reviews" id="reviews-title">
        {p.reviews.length === 0 ? <p className="text-sm text-muted">Not reviewed yet.</p> : (
          <ul className="divide-y divide-border">{p.reviews.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-sm text-text">{r.feedback ?? 'No feedback text'}<span className="block text-xs text-muted"><Timestamp iso={r.createdAt} /></span></span>
              <StatusBadge status={r.result} />
            </li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}

export function SessionDetail({ companyId, sessionId }: { companyId: string; sessionId: string }) {
  const session = useSession(companyId, sessionId);
  const crumbs = [{ href: base(companyId), label: 'Intelligence' }, { label: 'Session' }];
  if (session.isPending) return <SectionSkeleton rows={4} label="session" />;
  if (session.isError) {
    // A malformed id is rejected by the backend (400); show it as not found, like a missing or foreign one.
    const err = session.error instanceof ApiError && session.error.status === 400 ? new ApiError(404, '') : session.error;
    return (
      <div className="space-y-3">
        <PageHeader title="Intelligence session" crumbs={crumbs} />
        <QueryError error={err} />
        <Link href={base(companyId)} className="text-sm text-accent hover:underline">Back to intelligence</Link>
      </div>
    );
  }
  const s = session.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Intelligence session" crumbs={crumbs}><StatusBadge status={s.status} label="Session status" /></PageHeader>
      <section aria-label="Session details" className="motion-enter space-y-3 rounded-panel border border-border bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Objective</h3>
        <p className="whitespace-pre-line text-sm text-text">{s.objective || 'Not recorded'}</p>
        <DetailList items={[{ label: 'Started', value: <Timestamp iso={s.createdAt} /> }, { label: 'Last updated', value: <Timestamp iso={s.updatedAt} /> }]} />
      </section>
      <Panel title="Assessments" id="assessments-title">
        {s.assessments.length === 0 ? <p className="text-sm text-muted">No assessments recorded.</p> : (
          <ol className="space-y-3">{s.assessments.map((a) => (
            <li key={a.id} className="rounded-control border border-border p-3">
              <p className="text-xs text-muted"><Timestamp iso={a.createdAt} /></p>
              <p className="mt-1 text-sm text-text">{a.summary}</p>
              <details className="mt-1 text-sm"><summary className="cursor-pointer text-xs text-accent">Recommendation</summary><p className="mt-1 whitespace-pre-line text-text">{a.recommendation}</p></details>
            </li>
          ))}</ol>
        )}
      </Panel>
      <Panel title="Proposals from this session" id="session-proposals-title">
        {s.proposals.length === 0 ? <p className="text-sm text-muted">None.</p> : (
          <ul className="divide-y divide-border">{s.proposals.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2"><Link href={`${base(companyId)}/proposals/${enc(p.id)}`} className="text-sm text-text hover:text-accent">{p.title}</Link><StatusBadge status={p.status} /></li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}
