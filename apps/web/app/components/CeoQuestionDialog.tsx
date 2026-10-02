'use client';

import { useEffect, useRef, useState } from 'react';
import { Question } from '@phosphor-icons/react';
import { chairmanFetch } from '../lib/api';

interface CeoQuestion {
  id: string;
  question: string;
  context: { reason?: string; parameters?: Record<string, unknown> };
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  askedAt: string;
}

const URGENCY_COLOR = { LOW: 'var(--status-neutral)', MEDIUM: 'var(--status-caution)', HIGH: 'var(--status-critical)' };

/** When the CEO asks something, a dialog pops up; the Chairman answers and the CEO uses it in its next review. */
export default function CeoQuestionDialog() {
  const [queue, setQueue] = useState<CeoQuestion[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snoozed = useRef(new Set<string>());
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chairmanFetch<CeoQuestion[]>('/ceo/questions?status=OPEN').then((r) => setQueue(r.data ?? []));
    const onQuestion = (e: Event) => {
      const q = (e as CustomEvent).detail as CeoQuestion;
      setQueue((all) => (all.some((x) => x.id === q.id) ? all : [q, ...all]));
    };
    window.addEventListener('aevora:ceo.question', onQuestion);
    return () => window.removeEventListener('aevora:ceo.question', onQuestion);
  }, []);

  const current = queue.find((q) => !snoozed.current.has(q.id));
  useEffect(() => {
    if (current) textRef.current?.focus();
  }, [current?.id]);

  if (!current) return null;

  const later = () => {
    snoozed.current.add(current.id); // until the next page load
    setAnswer('');
    setError(null);
    setQueue((q) => [...q]);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    const r = await chairmanFetch(`/ceo/questions/${current.id}/answer`, { method: 'POST', body: { answer } });
    setBusy(false);
    if (r.error) return setError(r.error);
    setAnswer('');
    setError(null);
    setQueue((q) => q.filter((x) => x.id !== current.id));
  };

  const params = Object.entries(current.context?.parameters ?? {}).filter(([k]) => k !== 'question' && k !== 'urgency');

  return (
    <div className="dialog-overlay" onKeyDown={(e) => e.key === 'Escape' && later()}>
      <form className="dialog-box" role="dialog" aria-modal="true" aria-labelledby="ceo-q-title" onSubmit={send} style={{ maxWidth: 540 }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <Question size={16} aria-hidden="true" /> Your CEO is asking
          </span>
          <span className="badge" style={{ color: URGENCY_COLOR[current.urgency] }}>{current.urgency.toLowerCase()} urgency</span>
        </div>
        <h3 id="ceo-q-title" style={{ fontSize: '1.15rem', lineHeight: 1.4 }}>{current.question}</h3>

        {(current.context?.reason || params.length > 0) && (
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {current.context?.reason && <div><strong style={{ color: 'var(--text-primary)' }}>Why it&apos;s asking:</strong> {current.context.reason}</div>}
            {params.map(([k, v]) => (
              <div key={k} style={{ marginTop: 4 }}><span style={{ color: 'var(--text-muted)' }}>{k}:</span> {typeof v === 'string' ? v : JSON.stringify(v)}</div>
            ))}
          </div>
        )}

        <label className="field" style={{ marginBottom: 12 }}>
          <span>Your answer</span>
          <textarea ref={textRef} rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={2000} placeholder="e.g. Yes — try Jaipur, but keep the budget under ₹5,000." />
        </label>
        {error && <div className="signin-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          {queue.length > 1 && <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{queue.length - 1} more waiting</span>}
          <button type="button" className="btn btn-outline" onClick={later}>Later</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !answer.trim()}>{busy ? 'Sending…' : 'Tell CEO'}</button>
        </div>
      </form>
    </div>
  );
}
