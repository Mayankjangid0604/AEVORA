'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bffGet, bffPost } from '@/lib/bff-client';
import type {
  AutomationStatusView, DeliveryHistoryEvent, DeliveryProject, DeliveryProjectRow, EmailStatusView, EmployeeSummary,
  PipelineOpportunity, PipelineProposal,
} from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50';
const field = 'w-full rounded-md border border-border bg-surface px-2 py-1 text-sm';
const label = 'block text-xs font-medium text-muted';
const money = (n: number | null, c = 'INR') => (n === null ? '—' : `${c} ${n.toLocaleString('en-IN')}`);
const MGMT = 'Only the Chairman or management can change this; staff can view it.';
const CHAIRMAN = 'Only the Chairman can approve proposals or record customer acceptance of a project.';

type ApiErr = (Error & { status?: number }) | null;
function ErrorLine({ error }: { error: ApiErr }) {
  if (!error) return null;
  return <p role="alert" className="text-xs text-danger">{error.status === 403 ? `${MGMT} ${CHAIRMAN}` : error.message}</p>;
}

// ---------------------------------------------------------------- email / automation readiness

export function EmailStatusPanel({ companyId }: { companyId: string }) {
  const q = useQuery({ queryKey: ['company', companyId, 'email-status'], queryFn: ({ signal }) => bffGet<EmailStatusView>('system/email-status', { companyId, signal }), retry: false });
  return (
    <Panel title="Email readiness" id="email-status-title">
      {q.isPending ? <SectionSkeleton label="email status" rows={2} />
        : q.isError ? <QueryError error={q.error} />
        : (
          <div className="space-y-1 text-sm">
            <p>Provider: <strong>{q.data.provider}</strong> · Configuration: <StatusBadge status={q.data.configValid ? 'OK' : 'ATTENTION'} /></p>
            {q.data.problems.map((p) => <p key={p} className="text-xs text-danger">{p}</p>)}
            <p className="text-xs text-muted">General outreach: <strong>{q.data.generalOutreachEnabled ? 'ENABLED' : 'disabled'}</strong> (environment {q.data.outreachEnvironment}, safe mode {q.data.safeMode ? 'on' : 'off'}). Nothing in this page sends email.</p>
            {q.data.lastTest ? (
              <p className="text-xs">
                Last controlled test: {q.data.lastTest.smtpAccepted ? 'accepted by the mail server' : `failed (${q.data.lastTest.error ?? 'unknown'})`}
                {' '}<Timestamp iso={q.data.lastTest.at} /> — inbox delivery: <strong>{q.data.lastTest.inboxDelivery.replace('_', ' ').toLowerCase()}</strong>.
              </p>
            ) : <p className="text-xs text-muted">No controlled test has been run.</p>}
          </div>
        )}
    </Panel>
  );
}

export function AutomationLine({ companyId, inquiryId }: { companyId: string; inquiryId: string }) {
  const qc = useQueryClient();
  const key = ['company', companyId, 'inquiries', inquiryId, 'automation'];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => bffGet<AutomationStatusView>(`inquiries/${encodeURIComponent(inquiryId)}/automation`, { companyId, signal }), retry: false });
  const retry = useMutation({
    mutationFn: () => bffPost<AutomationStatusView>(`inquiries/${encodeURIComponent(inquiryId)}/automation/retry`, {}, { companyId }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  if (q.isPending || q.isError) return null;
  const s = q.data;
  return (
    <p className="text-xs text-muted" data-testid="automation-line">
      Automatic triage: <strong>{s.enabled ? s.state.replace('_', ' ').toLowerCase() : 'paused (INQUIRY_AUTOMATION_ENABLED=false)'}</strong>
      {s.attempts > 0 && ` · attempt ${s.attempts}/${s.maxAttempts}`}{s.lastError && <span className="text-danger"> · {s.lastError}</span>}
      {(s.state === 'NOT_QUEUED' || s.state === 'FAILED') && s.enabled && <> · <button type="button" className={btn} disabled={retry.isPending} onClick={() => retry.mutate()}>{s.state === 'FAILED' ? 'Retry' : 'Queue triage'}</button></>}
    </p>
  );
}

// ---------------------------------------------------------------- pipeline (opportunities + proposals)

export function PipelineWorkspace({ companyId }: { companyId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['company', companyId, 'opportunities'], queryFn: ({ signal }) => bffGet<PipelineOpportunity[]>('opportunity', { companyId, signal }) });
  return (
    <div className="space-y-6">
      <PageHeader title="Sales pipeline" description="Opportunities created from converted requests. Draft a proposal, get it approved, record that it was sent and accepted, then start the project. Nothing is emailed or published from this page." />
      <EmailStatusPanel companyId={companyId} />
      <Panel title="Opportunities" id="opps-title">
        {list.isPending ? <SectionSkeleton label="opportunities" />
          : list.isError ? <QueryError error={list.error} />
          : list.data.length === 0 ? <SystemState kind="empty" title="No opportunities yet" detail="Convert a qualified customer request to create one." />
          : (
            <ul className="divide-y divide-border">
              {list.data.map((o) => (
                <li key={o.id} className="py-2">
                  <button type="button" aria-expanded={openId === o.id} aria-controls={`opp-${o.id}`} onClick={() => setOpenId(openId === o.id ? null : o.id)} className="flex w-full flex-wrap items-center gap-3 text-left text-sm">
                    <StatusBadge status={o.proposals[0]?.status ?? 'NO_PROPOSAL'} />
                    <span className="font-medium">{o.clientName ?? o.title}</span>
                    <span className="text-muted">{o.title}</span>
                    <span className="font-mono text-xs text-muted">{o.reference ?? ''}</span>
                    <span className="ml-auto text-xs text-muted"><Timestamp iso={o.createdAt} /></span>
                  </button>
                  {openId === o.id && <OpportunityDetail companyId={companyId} opp={o} />}
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

function OpportunityDetail({ companyId, opp }: { companyId: string; opp: PipelineOpportunity }) {
  const qc = useQueryClient();
  const [proposalId, setProposalId] = useState<string | null>(opp.proposals[0]?.id ?? null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['company', companyId] });
  const gen = useMutation({
    mutationFn: () => bffPost<{ created: boolean; proposal: PipelineProposal }>(`opportunity/${encodeURIComponent(opp.id)}/proposals`, {}, { companyId }),
    onSuccess: (r) => setProposalId(r.proposal.id),
    onSettled: refresh,
  });
  return (
    <div id={`opp-${opp.id}`} className="mt-3 space-y-3 rounded-md border border-border bg-bg p-3 text-sm">
      <p className="text-xs text-muted">Estimated value: {money(opp.estimatedValue, opp.currency)} · Stage: {opp.salesStage.toLowerCase()} · Status: {opp.status.toLowerCase().replace('_', ' ')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={gen.isPending} onClick={() => gen.mutate()}>
          {opp.proposals.length ? 'Open the existing proposal' : 'Generate proposal draft'}
        </button>
        {opp.proposals.map((p) => (
          <button key={p.id} type="button" className={btn} aria-pressed={proposalId === p.id} onClick={() => setProposalId(p.id)}>v{p.version} · {p.status.toLowerCase().replace('_', ' ')}</button>
        ))}
      </div>
      {gen.data && !gen.data.created && <p className="text-xs text-muted">A proposal already exists, so no duplicate was created.</p>}
      <ErrorLine error={gen.error as ApiErr} />
      {proposalId && <ProposalEditor key={proposalId} companyId={companyId} id={proposalId} />}
    </div>
  );
}

const FIELD_LABEL: Record<'scope' | 'deliverables' | 'assumptions' | 'exclusions' | 'paymentTerms', string> = { scope: 'Scope', deliverables: 'Deliverables', assumptions: 'Assumptions', exclusions: 'Exclusions', paymentTerms: 'Payment terms (required, written by you)' };
const NUMERIC: { k: keyof PipelineProposal; label: string }[] = [
  { k: 'unitPrice', label: 'Price (whole currency units)' }, { k: 'quantity', label: 'Quantity' }, { k: 'discount', label: 'Discount' },
  { k: 'tax', label: 'Tax' }, { k: 'estimatedTimeline', label: 'Timeline (days)' }, { k: 'validityPeriod', label: 'Valid for (days)' },
];

function ProposalEditor({ companyId, id }: { companyId: string; id: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const key = ['company', companyId, 'proposal', id];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => bffGet<PipelineProposal>(`proposal/${encodeURIComponent(id)}`, { companyId, signal }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['company', companyId] });
  const act = (path: string, body: Record<string, string> = {}) => bffPost<PipelineProposal>(`proposal/${encodeURIComponent(id)}/${path}`, body, { companyId });
  const m = useMutation({
    mutationFn: (v: { path: string; body?: Record<string, string> }) => act(v.path, v.body),
    onSuccess: (_d, v) => { if (v.path === 'update') setDraft(null); },
    onSettled: refresh,
  });
  const toProject = useMutation({
    mutationFn: () => bffPost<{ created: boolean; projectId: string }>(`proposal/${encodeURIComponent(id)}/project`, {}, { companyId }),
    onSettled: refresh,
  });
  if (q.isPending) return <SectionSkeleton label="proposal" rows={3} />;
  if (q.isError) return <QueryError error={q.error} />;
  const p = q.data;
  const editable = p.status === 'DRAFT';
  const val = (k: string, fallback: string | number | null) => draft?.[k] ?? (fallback === null ? '' : String(fallback));
  const set = (k: string, v: string) => setDraft({ ...(draft ?? {}), [k]: v });
  const error = (m.error ?? toProject.error) as ApiErr;
  const sending = m.isPending || toProject.isPending;

  return (
    <div className="space-y-3 rounded-md border border-border p-3" data-testid="proposal-editor">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={p.status} />
        <strong>{p.title}</strong>
        <span className="text-xs text-muted">v{p.version} · Customer: {p.customerName ?? '—'} · Total {money(p.total, p.currency)}</span>
      </div>
      {editable && p.missing.length > 0 && <p className="text-xs text-warning" data-testid="proposal-missing">Still to fill in before it can be submitted: {p.missing.join(', ')}.</p>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (draft) m.mutate({ path: 'update', body: draft }); }}>
        {(['scope', 'deliverables', 'assumptions', 'exclusions', 'paymentTerms'] as const).map((k) => (
          <div key={k} className={k === 'scope' || k === 'deliverables' ? 'sm:col-span-2' : ''}>
            <label className={label} htmlFor={`${k}-${id}`}>{FIELD_LABEL[k]}</label>
            <textarea id={`${k}-${id}`} className={field} rows={k === 'scope' || k === 'deliverables' ? 4 : 2} disabled={!editable} maxLength={5000} value={val(k, p[k])} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
        {NUMERIC.map(({ k, label: l }) => (
          <div key={k}>
            <label className={label} htmlFor={`${k}-${id}`}>{l}</label>
            <input id={`${k}-${id}`} inputMode="numeric" className={field} disabled={!editable} value={val(k, p[k] as number | null)} onChange={(e) => set(k, e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        ))}
        <div>
          <label className={label} htmlFor={`currency-${id}`}>Currency</label>
          <select id={`currency-${id}`} className={field} disabled={!editable} value={val('currency', p.currency)} onChange={(e) => set('currency', e.target.value)}>
            {['INR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {editable && <div className="sm:col-span-2"><button type="submit" className={btn} disabled={!draft || sending}>Save draft</button></div>}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {p.status === 'DRAFT' && <button type="button" className={btn} disabled={sending || draft !== null || p.missing.length > 0} title={draft ? 'Save your changes first' : undefined} onClick={() => m.mutate({ path: 'submit' })}>Submit for Chairman approval</button>}
        {p.status === 'CHAIRMAN_APPROVAL' && !p.approved && (
          <>
            <button type="button" className={btn} disabled={sending} onClick={() => m.mutate({ path: 'decision', body: { decision: 'APPROVE' } })}>Approve (Chairman)</button>
            <input aria-label="Reason" className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-xs" placeholder="Reason (required to reject or ask for changes)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className={btn} disabled={sending || !reason.trim()} onClick={() => m.mutate({ path: 'decision', body: { decision: 'REQUEST_CHANGES', reason } })}>Ask for changes</button>
            <button type="button" className={btn} disabled={sending || !reason.trim()} onClick={() => m.mutate({ path: 'decision', body: { decision: 'REJECT', reason } })}>Reject</button>
          </>
        )}
        {p.status === 'CHAIRMAN_APPROVAL' && p.approved && <button type="button" className={btn} disabled={sending} onClick={() => m.mutate({ path: 'mark-sent' })}>Record: sent to customer</button>}
        {p.status === 'SENT' && (
          <>
            <button type="button" className={btn} disabled={sending} onClick={() => m.mutate({ path: 'customer-response', body: { response: 'ACCEPTED' } })}>Record: customer accepted</button>
            <button type="button" className={btn} disabled={sending} onClick={() => m.mutate({ path: 'customer-response', body: { response: 'DECLINED' } })}>Record: customer declined</button>
          </>
        )}
        {p.status === 'ACCEPTED' && !p.projectId && <button type="button" className={btn} disabled={sending} onClick={() => toProject.mutate()}>Start project</button>}
        {p.projectId && <span className="text-xs">Project started — see the Projects &amp; delivery page.</span>}
      </div>
      <p className="text-xs text-muted">“Record” buttons only note what you did outside AEVORA. AEVORA does not email proposals.</p>
      {p.approvals.length > 0 && (
        <ul className="text-xs text-muted">{p.approvals.map((a, i) => <li key={i}>{a.decision.toLowerCase().replace('_', ' ')}{a.reason ? ` — ${a.reason}` : ''} · <Timestamp iso={a.at} /></li>)}</ul>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

// ---------------------------------------------------------------- delivery (projects + tasks)

const PROJECT_NEXT: Record<string, { to: string; label: string; chairman?: boolean }[]> = {
  PLANNED: [{ to: 'ACTIVE', label: 'Start work' }, { to: 'CANCELLED', label: 'Cancel project' }],
  ACTIVE: [{ to: 'IN_QA', label: 'Send to QA' }, { to: 'PAUSED', label: 'Pause' }, { to: 'CANCELLED', label: 'Cancel project' }],
  PAUSED: [{ to: 'ACTIVE', label: 'Resume' }, { to: 'CANCELLED', label: 'Cancel project' }],
  IN_QA: [{ to: 'DELIVERED', label: 'Mark delivered' }, { to: 'ACTIVE', label: 'Back to work' }],
  DELIVERED: [{ to: 'ACCEPTED', label: 'Record: customer accepted delivery', chairman: true }, { to: 'ACTIVE', label: 'Re-open work' }],
  ACCEPTED: [{ to: 'COMPLETED', label: 'Complete project' }],
};
const TASK_NEXT: Record<string, { to: string; label: string }[]> = {
  BACKLOG: [{ to: 'READY', label: 'Ready' }, { to: 'CANCELLED', label: 'Cancel' }],
  READY: [{ to: 'IN_PROGRESS', label: 'Start' }, { to: 'BLOCKED', label: 'Block' }, { to: 'CANCELLED', label: 'Cancel' }],
  IN_PROGRESS: [{ to: 'REVIEW', label: 'Send to review' }, { to: 'BLOCKED', label: 'Block' }, { to: 'CANCELLED', label: 'Cancel' }],
  BLOCKED: [{ to: 'READY', label: 'Unblock' }, { to: 'CANCELLED', label: 'Cancel' }],
  REVIEW: [{ to: 'COMPLETED', label: 'Complete' }, { to: 'IN_PROGRESS', label: 'Back to work' }],
};

export function DeliveryWorkspace({ companyId }: { companyId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['company', companyId, 'delivery'], queryFn: ({ signal }) => bffGet<DeliveryProjectRow[]>('delivery-projects', { companyId, signal }) });
  return (
    <div className="space-y-6">
      <PageHeader title="Projects &amp; delivery" description="Projects started from accepted proposals. Track tasks, assignment and delivery status. Customer acceptance is recorded by the Chairman." />
      <Panel title="Projects" id="delivery-title">
        {list.isPending ? <SectionSkeleton label="projects" />
          : list.isError ? <QueryError error={list.error} />
          : list.data.length === 0 ? <SystemState kind="empty" title="No delivery projects yet" detail="Start one from an accepted proposal on the Sales pipeline page." />
          : (
            <ul className="divide-y divide-border">
              {list.data.map((p) => (
                <li key={p.id} className="py-2">
                  <button type="button" aria-expanded={openId === p.id} aria-controls={`prj-${p.id}`} onClick={() => setOpenId(openId === p.id ? null : p.id)} className="flex w-full flex-wrap items-center gap-3 text-left text-sm">
                    <StatusBadge status={p.status} />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted">{p.clientName ?? '—'}</span>
                    <span className="text-xs text-muted">{p.taskCount} task(s) · {money(p.quotedPrice)}</span>
                    <span className="ml-auto text-xs text-muted"><Timestamp iso={p.createdAt} /></span>
                  </button>
                  {openId === p.id && <ProjectDetail companyId={companyId} id={p.id} />}
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

function ProjectDetail({ companyId, id }: { companyId: string; id: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const key = ['company', companyId, 'delivery', id];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => bffGet<DeliveryProject>(`delivery-projects/${encodeURIComponent(id)}`, { companyId, signal }) });
  const hist = useQuery({ queryKey: [...key, 'history'], queryFn: ({ signal }) => bffGet<DeliveryHistoryEvent[]>(`delivery-projects/${encodeURIComponent(id)}/history`, { companyId, signal }) });
  const emps = useQuery({ queryKey: ['company', companyId, 'employees'], queryFn: ({ signal }) => bffGet<EmployeeSummary[]>('organization/employees', { companyId, signal }), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ['company', companyId, 'delivery'] });
  const post = useMutation({
    mutationFn: (v: { path: string; body: Record<string, string> }) => bffPost<unknown>(`delivery-projects/${encodeURIComponent(id)}/${v.path}`, v.body, { companyId }),
    onSuccess: (_d, v) => { if (v.path === 'tasks') setTitle(''); },
    onSettled: refresh,
  });
  if (q.isPending) return <div id={`prj-${id}`} className="mt-2"><SectionSkeleton label="project" rows={3} /></div>;
  if (q.isError) return <div id={`prj-${id}`} className="mt-2"><QueryError error={q.error} /></div>;
  const p = q.data;
  const closed = p.status === 'COMPLETED' || p.status === 'CANCELLED';
  return (
    <div id={`prj-${id}`} className="mt-3 space-y-3 rounded-md border border-border bg-bg p-3 text-sm" data-testid="project-detail">
      <p className="text-xs text-muted">Customer: {p.clientName ?? '—'} · Opportunity: {p.opportunityTitle ?? '—'} · Proposal: {p.proposalTitle ?? '—'} · Quoted {money(p.quotedPrice)}</p>
      <div className="flex flex-wrap gap-2">
        {(PROJECT_NEXT[p.status] ?? []).map((t) => (
          <button key={t.to} type="button" className={btn} disabled={post.isPending} onClick={() => post.mutate({ path: 'status', body: { from: p.status, to: t.to } })}>{t.label}</button>
        ))}
        {closed && <span className="text-xs text-muted">This project is {p.status.toLowerCase()}.</span>}
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Tasks</h4>
        {p.tasks.length === 0 ? <p className="mt-1 text-xs text-muted">No tasks yet.</p> : (
          <ul className="mt-1 divide-y divide-border">
            {p.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <StatusBadge status={t.status} />
                <span>{t.title}</span>
                <span className="text-xs text-muted">{t.priority.toLowerCase()}</span>
                <select aria-label={`Assign ${t.title}`} className="rounded-md border border-border bg-surface px-1 py-0.5 text-xs" disabled={post.isPending || t.status === 'COMPLETED' || t.status === 'CANCELLED'} value={t.assignedEmployeeId ?? ''} onChange={(e) => e.target.value && post.mutate({ path: `tasks/${encodeURIComponent(t.id)}/assign`, body: { employeeId: e.target.value } })}>
                  <option value="">Unassigned</option>
                  {(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {(TASK_NEXT[t.status] ?? []).map((n) => (
                  <button key={n.to} type="button" className={btn} disabled={post.isPending} onClick={() => post.mutate({ path: `tasks/${encodeURIComponent(t.id)}/status`, body: { from: t.status, to: n.to } })}>{n.label}</button>
                ))}
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) post.mutate({ path: 'tasks', body: { title: title.trim(), ...(assignee ? { assignedEmployeeId: assignee } : {}) } }); }}>
            <label htmlFor={`task-${id}`} className="sr-only">New task title</label>
            <input id={`task-${id}`} className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm" maxLength={200} placeholder="New task title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor={`assignee-${id}`} className="sr-only">Assign to</label>
            <select id={`assignee-${id}`} className="rounded-md border border-border bg-surface px-1 text-xs" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button type="submit" className={btn} disabled={post.isPending || !title.trim()}>Add task</button>
          </form>
        )}
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">History</h4>
        {hist.isPending ? <p className="text-xs text-muted">Loading…</p> : hist.isError ? <p className="text-xs text-danger">History unavailable.</p> : (
          <ul className="mt-1 text-xs text-muted">{hist.data.map((h) => <li key={h.id}>{h.action.toLowerCase().replace(/_/g, ' ')} · {h.actorType.toLowerCase()} · <Timestamp iso={h.at} /></li>)}</ul>
        )}
      </div>
      <ErrorLine error={post.error as ApiErr} />
    </div>
  );
}
