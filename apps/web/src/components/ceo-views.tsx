'use client';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import type { CeoFeedItem, CeoQuestionView, ManagementDecision, OperationalAlert } from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const CHAIRMAN_ONLY = 'Only the Chairman of this company can see this.';

export const useCeoFeed = (companyId: string) =>
  useQuery({ queryKey: companyKeys.ceo(companyId, 'feed'), queryFn: ({ signal }) => bffGet<CeoFeedItem[]>('ceo/feed', { companyId, signal }) });
export const useCeoQuestions = (companyId: string) =>
  useQuery({ queryKey: companyKeys.ceo(companyId, 'questions'), queryFn: ({ signal }) => bffGet<CeoQuestionView[]>('ceo/questions', { companyId, signal }) });
const useDecisions = (companyId: string) =>
  useQuery({ queryKey: companyKeys.chairman(companyId, 'decisions'), queryFn: ({ signal }) => bffGet<ManagementDecision[]>('chairman/decisions', { companyId, signal }) });
const useAlerts = (companyId: string) =>
  useQuery({ queryKey: companyKeys.chairman(companyId, 'alerts'), queryFn: ({ signal }) => bffGet<OperationalAlert[]>('chairman/alerts', { companyId, signal }) });

const Tag = ({ children }: { children: string }) =>
  <span className="whitespace-nowrap rounded-control border border-accent/40 px-1.5 py-0.5 text-[11px] text-accent">{children}</span>;

const KIND: Record<string, string> = { REVIEW: 'Business review', WEEKLY_REPORT: 'Weekly report' };

export function CeoFeed({ rows }: { rows: CeoFeedItem[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((f) => (
        <li key={f.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>AI CEO</Tag>
            <span className="text-xs text-muted">{KIND[f.kind] ?? f.kind}</span>
            {f.outcome && <span className="text-xs text-muted">· recorded outcome: {f.outcome}</span>}
            <span className="ml-auto text-xs text-muted"><Timestamp iso={f.at} /></span>
          </div>
          <p className="text-sm text-text">{f.title}</p>
          {f.detail && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1 whitespace-pre-line">{f.detail}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CeoQuestions({ rows }: { rows: CeoQuestionView[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((q) => (
        <li key={q.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>Asked by AI CEO</Tag>
            <StatusBadge status={q.status} />
            <span className="text-xs text-muted">Urgency: {q.urgency}</span>
            <span className="ml-auto text-xs text-muted"><Timestamp iso={q.askedAt} /></span>
          </div>
          <p className="text-sm text-text">{q.question}</p>
          {q.chairmanAnswer
            ? <p className="text-xs text-muted">Chairman&apos;s answer (human), <Timestamp iso={q.answeredAt} />: <span className="text-text">{q.chairmanAnswer}</span></p>
            : <p className="text-xs text-muted">Not answered.</p>}
        </li>
      ))}
    </ul>
  );
}

export function CeoWorkspace({ companyId }: { companyId: string }) {
  const feed = useCeoFeed(companyId);
  const questions = useCeoQuestions(companyId);
  return (
    <div className="space-y-6">
      <PageHeader title="AI CEO" description="What the AI CEO recorded for this company: reviews, actions it logged, weekly reports and questions to the Chairman. Read-only; no model is run from this page." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="CEO record (latest 20)" id="feed-title">
          {feed.isPending ? <SectionSkeleton label="CEO record" />
            : feed.isError ? <QueryError error={feed.error} />
            : feed.data.length === 0 ? <SystemState kind="empty" title="Nothing recorded" detail="The AI CEO has not recorded a review or weekly report for this company." />
            : <CeoFeed rows={feed.data} />}
        </Panel>
        <Panel title="Questions to the Chairman" id="questions-title">
          {questions.isPending ? <SectionSkeleton label="CEO questions" />
            : questions.isError ? <QueryError error={questions.error} />
            : questions.data.length === 0 ? <SystemState kind="empty" title="No questions" detail="The AI CEO has not asked the Chairman anything." />
            : <CeoQuestions rows={questions.data} />}
        </Panel>
      </div>
      <p className="text-xs text-muted">Asking the CEO, answering its questions and running reviews call a model or change records; they are not available in this release.</p>
    </div>
  );
}

export function DecisionTable({ rows }: { rows: ManagementDecision[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((d) => (
        <li key={d.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            <span className="text-xs text-muted">{d.type}</span>
            <span className="ml-auto text-xs text-muted">Proposed <Timestamp iso={d.createdAt} /></span>
          </div>
          <p className="text-sm text-text">{d.title}</p>
          {d.description && <p className="text-xs text-muted">{d.description}</p>}
          <p className="text-xs text-muted">
            Proposed by employee {d.proposer?.name ?? 'not recorded'}
            {d.targetEmployee ? ` · concerns ${d.targetEmployee.name}` : ''}
            {d.approvedAt ? <> · decided <Timestamp iso={d.approvedAt} /></> : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function DecisionsWorkspace({ companyId }: { companyId: string }) {
  const q = useDecisions(companyId);
  return (
    <div className="space-y-6">
      <PageHeader title="Decisions" description="Management decisions as the backend records them, newest first. Status is shown verbatim; nothing is scored or ranked. Read-only." />
      <Panel title="Management decisions" id="decisions-title">
        {q.isPending ? <SectionSkeleton label="decisions" />
          : q.isError ? <QueryError error={q.error} forbiddenDetail={CHAIRMAN_ONLY} />
          : q.data.length === 0 ? <SystemState kind="empty" title="No decisions" detail="No management decision has been recorded for this company." />
          : <DecisionTable rows={q.data} />}
      </Panel>
      <p className="text-xs text-muted">Approving and rejecting decisions is not available in this release.</p>
    </div>
  );
}

export function AlertTable({ rows }: { rows: OperationalAlert[] }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((a) => (
        <li key={a.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-control border border-border px-1.5 py-0.5 text-[11px] font-semibold">{a.severity}</span>
            <StatusBadge status={a.status} />
            <span className="text-xs text-muted">{a.category} · system alert</span>
            <span className="ml-auto text-xs text-muted"><Timestamp iso={a.createdAt} /></span>
          </div>
          <p className="text-sm text-text">{a.title}</p>
          {a.description && <p className="text-xs text-muted">{a.description}</p>}
        </li>
      ))}
    </ul>
  );
}

export function AttentionWorkspace({ companyId }: { companyId: string }) {
  const alerts = useAlerts(companyId);
  const questions = useCeoQuestions(companyId);
  const open = questions.data?.filter((x) => x.status === 'OPEN') ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Attention" description="Operational alerts raised by the system and AI CEO questions still waiting for the Chairman. Activity events are not alerts and are not shown here. Read-only." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Operational alerts" id="alerts-title">
          {alerts.isPending ? <SectionSkeleton label="alerts" />
            : alerts.isError ? <QueryError error={alerts.error} forbiddenDetail={CHAIRMAN_ONLY} />
            : alerts.data.length === 0 ? <SystemState kind="empty" title="No alerts" detail="The backend reports no operational alerts for this company." />
            : <AlertTable rows={alerts.data} />}
        </Panel>
        <Panel title="AI CEO questions awaiting an answer" id="open-questions-title">
          {questions.isPending ? <SectionSkeleton label="CEO questions" />
            : questions.isError ? <QueryError error={questions.error} />
            : open.length === 0 ? <SystemState kind="empty" title="No open questions" detail="The AI CEO has no unanswered question for the Chairman." />
            : <CeoQuestions rows={open} />}
        </Panel>
      </div>
    </div>
  );
}
