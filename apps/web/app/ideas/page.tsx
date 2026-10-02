'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { formatINRWhole, timeAgo } from '../components/ui';

interface Idea {
  id: string;
  title: string;
  description: string;
  source: string;
  status: string;
  ceoScore: number | null;
  ceoEvaluation: string | null;
  ceoQuestion: string | null;
  rejectionReason: string | null;
  targetMarket: string | null;
  estimatedBudget: number | null;
  venture: { id: string; name: string } | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--status-caution)',
  EVALUATING: 'var(--status-info)',
  APPROVED: 'var(--status-healthy)',
  REJECTED: 'var(--status-critical)',
  VENTURE_CREATED: 'var(--accent-purple)',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  EVALUATING: 'CEO evaluating…',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  VENTURE_CREATED: 'Venture created',
};

const scoreColor = (s: number) => (s >= 7 ? 'var(--status-healthy)' : s >= 5 ? 'var(--status-caution)' : 'var(--status-critical)');

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  async function load() {
    const r = await chairmanFetch<Idea[]>('/ideas');
    if (r.data) setIdeas(r.data);
    else setIdeas((prev) => prev ?? []);
    setError(r.error);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  async function submitIdea(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    const r = await chairmanFetch('/ideas', { method: 'POST', body: { title: title.trim(), description: description.trim() } });
    if (r.error) setError(r.error);
    else {
      setTitle('');
      setDescription('');
      setNotice('Idea submitted — the CEO is evaluating it (about a minute).');
    }
    await load();
    setSubmitting(false);
  }

  async function act(id: string, path: string, body?: any) {
    setBusyId(id);
    const r = await chairmanFetch(`/ideas/${id}/${path}`, { method: 'POST', body });
    if (r.error) setError(r.error);
    await load();
    setBusyId(null);
  }

  async function answer(id: string) {
    const a = answers[id]?.trim();
    if (!a) return;
    await act(id, 'answer', { answer: a });
    setAnswers((prev) => ({ ...prev, [id]: '' }));
  }

  async function generateCeoIdea() {
    setGenerating(true);
    const r = await chairmanFetch<any>('/ideas/generate/ceo', { method: 'POST' });
    if (r.error) setError(r.error);
    else setNotice(r.data?.message ?? `CEO came up with: "${r.data?.title}" — evaluating now.`);
    await load();
    setGenerating(false);
  }

  if (!ideas) return <div className="state-loading">Loading ideas…</div>;

  const pending = ideas.filter((i) => ['PENDING', 'EVALUATING'].includes(i.status));
  const approved = ideas.filter((i) => ['APPROVED', 'VENTURE_CREATED'].includes(i.status));
  const rejected = ideas.filter((i) => i.status === 'REJECTED');
  const ceoGenerated = ideas.filter((i) => i.source === 'CEO_GENERATED');

  const cardProps = { answers, setAnswers, busyId, onAnswer: answer, onApprove: (id: string) => act(id, 'approve'), onReject: (id: string) => act(id, 'reject', { reason: 'Rejected by Chairman' }) };

  return (
    <>
      <div className="page-header">
        <h2>Startup Ideas</h2>
        <p>Your ideas become companies. The CEO evaluates each one automatically.</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}
      {notice && !error && <div className="state-empty" style={{ marginBottom: 16, padding: 12 }}>{notice}</div>}

      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        <div className="card"><div className="card-label">Total ideas</div><div className="card-value">{ideas.length}</div></div>
        <div className="card"><div className="card-label">In review</div><div className="card-value" style={{ color: 'var(--status-caution)' }}>{pending.length}</div></div>
        <div className="card"><div className="card-label">Approved</div><div className="card-value" style={{ color: 'var(--status-healthy)' }}>{approved.length}</div></div>
        <div className="card"><div className="card-label">CEO generated</div><div className="card-value" style={{ color: 'var(--accent-purple)' }}>{ceoGenerated.length}</div></div>
      </div>

      <form onSubmit={submitIdea} className="section">
        <div className="section-title">Submit new idea</div>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Food delivery app for Sikar" maxLength={200} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What problem does it solve? Who are the customers?"
            rows={3}
            maxLength={5000}
            style={{ resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={submitting || !title.trim() || !description.trim()}>
            {submitting ? 'Submitting…' : 'Submit idea'}
          </button>
          <button className="btn btn-outline" type="button" onClick={generateCeoIdea} disabled={generating}>
            {generating ? 'CEO is thinking… (about a minute)' : 'Ask CEO to generate an idea'}
          </button>
        </div>
      </form>

      {pending.length > 0 && (
        <section className="section">
          <div className="section-title">Needs attention ({pending.length})</div>
          {pending.map((idea) => <IdeaCard key={idea.id} idea={idea} {...cardProps} />)}
        </section>
      )}

      {approved.length > 0 && (
        <section className="section">
          <div className="section-title">Approved ({approved.length})</div>
          {approved.map((idea) => <IdeaCard key={idea.id} idea={idea} {...cardProps} />)}
        </section>
      )}

      {rejected.length > 0 && (
        <section className="section">
          <div className="section-title">Rejected ({rejected.length})</div>
          {rejected.map((idea) => <IdeaCard key={idea.id} idea={idea} {...cardProps} collapsed />)}
        </section>
      )}

      {ideas.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">No ideas yet</div>
          <div className="empty-state-desc">Submit your first idea above, or ask the CEO to generate one.</div>
        </div>
      )}
    </>
  );
}

function IdeaCard({
  idea, answers, setAnswers, busyId, onAnswer, onApprove, onReject, collapsed = false,
}: {
  idea: Idea;
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busyId: string | null;
  onAnswer: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsed);
  const busy = busyId === idea.id;
  const canDecide = idea.status === 'PENDING' || (idea.status === 'APPROVED' && !idea.venture);

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${STATUS_COLORS[idea.status] ?? 'var(--border-default)'}` }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong>{idea.title}</strong>
            <span style={{ fontSize: 12, color: STATUS_COLORS[idea.status] }}>{STATUS_LABELS[idea.status] ?? idea.status}</span>
            {idea.source === 'CEO_GENERATED' && <span className="badge badge-info">CEO idea</span>}
          </div>
          {!expanded && <p className="truncate" style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{idea.description}</p>}
        </div>
        {idea.ceoScore !== null && (
          <div style={{ minWidth: 52 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor(idea.ceoScore) }}>{idea.ceoScore}/10</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CEO score</div>
          </div>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line', marginTop: 0 }}>{idea.description}</p>
          {idea.targetMarket && <p style={{ color: 'var(--text-secondary)' }}><strong>Target market:</strong> {idea.targetMarket}</p>}
          {idea.estimatedBudget !== null && <p style={{ color: 'var(--text-secondary)' }}><strong>Est. budget:</strong> {formatINRWhole(idea.estimatedBudget)}</p>}

          {idea.ceoEvaluation && (
            <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-md)', margin: '12px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>CEO analysis</div>
              <div style={{ whiteSpace: 'pre-line' }}>{idea.ceoEvaluation}</div>
            </div>
          )}

          {idea.status === 'PENDING' && idea.ceoQuestion && (
            <div style={{ border: '1px solid var(--status-caution)', padding: 12, borderRadius: 'var(--radius-md)', margin: '12px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-caution)', marginBottom: 6 }}>CEO needs clarification</div>
              <p style={{ marginTop: 0 }}>{idea.ceoQuestion}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label="Your answer"
                  value={answers[idea.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && onAnswer(idea.id)}
                  placeholder="Your answer…"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => onAnswer(idea.id)} disabled={busy || !answers[idea.id]?.trim()}>Answer</button>
              </div>
            </div>
          )}

          {idea.rejectionReason && <p style={{ color: 'var(--status-critical)' }}><strong>Rejection reason:</strong> {idea.rejectionReason}</p>}
          {idea.venture && <p style={{ color: 'var(--status-healthy)' }}>Venture “{idea.venture.name}” created — see <a href="/ventures">Ventures</a></p>}

          {canDecide && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => onApprove(idea.id)} disabled={busy}>
                {busy ? 'Forming team… (about a minute)' : idea.status === 'APPROVED' ? 'Retry venture' : 'Approve'}
              </button>
              {idea.status === 'PENDING' && (
                <button className="btn btn-danger btn-sm" onClick={() => onReject(idea.id)} disabled={busy}>Reject</button>
              )}
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 0 }}>{timeAgo(idea.createdAt)}</p>
        </div>
      )}
    </div>
  );
}
