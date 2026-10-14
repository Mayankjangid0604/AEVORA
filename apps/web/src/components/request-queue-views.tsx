'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bffGet, bffPost } from '@/lib/bff-client';
import type { InquiryView, JobView } from '@/lib/types';
import { PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

/** Must match TRANSITIONS in apps/api/src/inquiry/intake.ts (the API enforces it; this only offers valid buttons). */
const NEXT: Record<string, { to: string; label: string }[]> = {
  NEW: [{ to: 'UNDER_REVIEW', label: 'Start review' }, { to: 'REJECTED', label: 'Reject' }],
  UNDER_REVIEW: [{ to: 'QUALIFIED', label: 'Qualify' }, { to: 'REJECTED', label: 'Reject' }],
  QUALIFIED: [{ to: 'CONVERTED', label: 'Mark converted' }, { to: 'REJECTED', label: 'Reject' }],
  REJECTED: [{ to: 'UNDER_REVIEW', label: 'Reopen' }],
  CONVERTED: [],
};
const FILTERS = ['ALL', 'NEW', 'UNDER_REVIEW', 'QUALIFIED', 'REJECTED', 'CONVERTED'];
const MANAGEMENT_ONLY = 'Only the Chairman or management can change requests; staff can view them.';
const btn = 'rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50';

export function RequestQueueWorkspace({ companyId }: { companyId: string }) {
  const [filter, setFilter] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['company', companyId, 'inquiries'], queryFn: ({ signal }) => bffGet<InquiryView[]>('inquiries', { companyId, signal }) });
  // ponytail: client-side filter over the latest 200 requests; add server-side paging when a tenant exceeds that.
  const rows = (list.data ?? []).filter((r) => filter === 'ALL' || r.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="Customer requests" description="Requests submitted on the public form (/request). Review, qualify or reject them here. Nothing is emailed or published from this page." />
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`${btn} aria-pressed:bg-accent aria-pressed:text-on-accent`}>
            {s === 'ALL' ? 'All' : s.replace('_', ' ').toLowerCase()}
          </button>
        ))}
      </div>
      <Panel title="Queue" id="queue-title">
        {list.isPending ? <SectionSkeleton label="requests" />
          : list.isError ? <QueryError error={list.error} />
          : rows.length === 0 ? <SystemState kind="empty" title="No requests" detail={filter === 'ALL' ? 'No customer has submitted a request yet.' : 'No request has this status.'} />
          : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="py-2">
                  <button type="button" aria-expanded={openId === r.id} aria-controls={`req-${r.id}`} onClick={() => setOpenId(openId === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-3 text-left text-sm">
                    <StatusBadge status={r.status} />
                    <span className="font-medium">{r.businessName ?? r.title}</span>
                    <span className="text-muted">{r.service?.replace('_', ' ').toLowerCase() ?? '—'}</span>
                    <span className="font-mono text-xs text-muted">{r.reference ?? 'no reference'}</span>
                    <span className="ml-auto text-xs text-muted"><Timestamp iso={r.receivedAt} /></span>
                  </button>
                  {openId === r.id && <RequestDetail companyId={companyId} id={r.id} />}
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

function RequestDetail({ companyId, id }: { companyId: string; id: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const detail = useQuery({ queryKey: ['company', companyId, 'inquiries', id], queryFn: ({ signal }) => bffGet<InquiryView>(`inquiries/${encodeURIComponent(id)}`, { companyId, signal }) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['company', companyId, 'inquiries'] })]);
  const move = useMutation({
    mutationFn: (v: { from: string; to: string }) => bffPost<InquiryView>(`inquiries/${encodeURIComponent(id)}/transition`, v, { companyId }),
    onSettled: refresh, // on 409 the reload shows what changed
  });
  const addNote = useMutation({
    mutationFn: () => bffPost<InquiryView>(`inquiries/${encodeURIComponent(id)}/notes`, { note }, { companyId }),
    onSuccess: () => setNote(''),
    onSettled: refresh,
  });

  if (detail.isPending) return <div id={`req-${id}`} className="mt-2"><SectionSkeleton label="request" rows={2} /></div>;
  if (detail.isError) return <div id={`req-${id}`} className="mt-2"><QueryError error={detail.error} /></div>;
  const r = detail.data;
  const error = (move.error ?? addNote.error) as (Error & { status?: number }) | null;
  return (
    <div id={`req-${id}`} className="mt-3 space-y-3 rounded-md border border-border bg-bg p-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Contact</dt><dd>{r.contactName ?? '—'}</dd>
        <dt className="text-muted">Email</dt><dd>{r.contactEmail ?? '—'}</dd>
        <dt className="text-muted">Phone</dt><dd>{r.contactPhone ?? '—'}</dd>
        <dt className="text-muted">Source</dt><dd>{r.source ?? '—'}</dd>
      </dl>
      <p className="whitespace-pre-wrap">{r.description}</p>
      <div className="flex flex-wrap gap-2">
        {(NEXT[r.status] ?? []).map((t) => (
          <button key={t.to} type="button" className={btn} disabled={move.isPending} onClick={() => move.mutate({ from: r.status, to: t.to })}>{t.label}</button>
        ))}
        {(NEXT[r.status] ?? []).length === 0 && <span className="text-xs text-muted">Converted requests are final.</span>}
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Internal notes (staff only)</h4>
        <pre className="mt-1 whitespace-pre-wrap font-sans text-xs">{r.notes ?? 'No notes yet.'}</pre>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
          <label htmlFor={`note-${id}`} className="sr-only">Add an internal note</label>
          <input id={`note-${id}`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm" />
          <button type="submit" className={btn} disabled={addNote.isPending || !note.trim()}>Add note</button>
        </form>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error.status === 403 ? MANAGEMENT_ONLY : error.message}</p>}
    </div>
  );
}

const JOB_ACTIONS: Record<string, { action: 'pause' | 'resume' | 'replay'; label: string }[]> = {
  QUEUED: [{ action: 'pause', label: 'Pause' }],
  PAUSED: [{ action: 'resume', label: 'Resume' }],
  FAILED: [{ action: 'replay', label: 'Replay' }],
  CANCELLED: [{ action: 'replay', label: 'Replay' }],
};

export function JobControlsWorkspace({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ['company', companyId, 'jobs'], queryFn: ({ signal }) => bffGet<JobView[]>('job', { companyId, signal }) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: string }) => bffPost<JobView>(`job/${encodeURIComponent(v.id)}/${v.action}`, {}, { companyId }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['company', companyId, 'jobs'] }),
  });
  const error = act.error as (Error & { status?: number }) | null;
  return (
    <div className="space-y-6">
      <PageHeader title="Background jobs" description="This company's latest 100 background jobs. Pause queued jobs, resume paused ones, or replay failed internal jobs (at most 3 replays each). Every action is audited." />
      {error && <p role="alert" className="text-sm text-danger">{error.status === 403 ? 'Only the Chairman or management can control jobs.' : error.message}</p>}
      <Panel title="Jobs" id="jobs-title">
        {jobs.isPending ? <SectionSkeleton label="jobs" />
          : jobs.isError ? <QueryError error={jobs.error} forbiddenDetail="Only the Chairman or management can view jobs." />
          : jobs.data.length === 0 ? <SystemState kind="empty" title="No jobs" detail="This company has no background jobs." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Background jobs</caption>
                <thead className="text-left text-xs text-muted">
                  <tr><th scope="col" className="py-1 pr-3 font-normal">Type</th><th scope="col" className="pr-3 font-normal">Status</th><th scope="col" className="pr-3 font-normal">Attempts</th><th scope="col" className="pr-3 font-normal">Last error</th><th scope="col" className="pr-3 font-normal">Created</th><th scope="col" className="font-normal"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.data.map((j) => (
                    <tr key={j.id}>
                      <th scope="row" className="py-1.5 pr-3 text-left font-mono text-xs font-normal">{j.type}</th>
                      <td className="pr-3"><StatusBadge status={j.status} /></td>
                      <td className="pr-3 text-muted">{j.attempts}/{j.maxAttempts}</td>
                      <td className="max-w-xs truncate pr-3 text-xs text-muted" title={j.lastError ?? undefined}>{j.lastError ?? '—'}</td>
                      <td className="whitespace-nowrap pr-3 text-xs text-muted"><Timestamp iso={j.createdAt} /></td>
                      <td className="whitespace-nowrap">
                        {(JOB_ACTIONS[j.status] ?? []).map((a) => (
                          <button key={a.action} type="button" className={btn} disabled={act.isPending} onClick={() => act.mutate({ id: j.id, action: a.action })}>{a.label}</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </div>
  );
}
