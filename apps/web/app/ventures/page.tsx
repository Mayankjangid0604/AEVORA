'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { timeAgo } from '../components/ui';

export default function VenturesPage() {
  const [ventures, setVentures] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await chairmanFetch<any[]>('/ventures');
    setVentures(r.data ?? []);
    setError(r.error);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) return;
    setBusy(true);
    const r = await chairmanFetch('/ventures', { method: 'POST', body: { idea, idempotencyKey: crypto.randomUUID() } });
    if (r.error) setError(r.error);
    else setIdea('');
    await load();
    setBusy(false);
  }

  async function setStatus(id: string, status: string) {
    const r = await chairmanFetch(`/ventures/${id}/status`, { method: 'POST', body: { status } });
    if (r.error) setError(r.error);
    await load();
  }

  if (!ventures) return <div className="state-loading">Loading ventures…</div>;

  return (
    <>
      <div className="page-header">
        <h2>Ventures</h2>
        <p>Startup ideas turned into teams — or say one to the mic</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      <form onSubmit={create} className="section" style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="Startup idea"
          placeholder="e.g. Food delivery app for Sikar"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit" disabled={busy || !idea.trim()}>{busy ? 'Forming team…' : 'Start venture'}</button>
      </form>

      {ventures.length === 0 ? (
        <div className="state-empty">No ventures yet</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {ventures.map((v) => (
            <div key={v.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{v.name}</strong>
                <span className={`badge badge-${v.status.toLowerCase()}`}>{v.status}</span>
              </div>
              <div className="card-sub" style={{ margin: '6px 0' }}>{v.idea}</div>
              {v.error && <div style={{ color: 'var(--status-critical)', fontSize: 12 }}>{v.error}</div>}
              <div className="card-label" style={{ marginTop: 8 }}>Team ({v.team.length})</div>
              <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
                {v.team.map((m: any) => (
                  <li key={m.id} style={{ fontSize: 13 }}>{m.role} — {m.employee?.name}</li>
                ))}
              </ul>
              {v.plan?.estimatedTimeline && <div className="card-sub">Timeline: {v.plan.estimatedTimeline}</div>}
              <div className="card-sub">Created {timeAgo(v.createdAt)}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {v.status === 'ACTIVE' && <button className="btn" onClick={() => setStatus(v.id, 'PAUSED')}>Pause</button>}
                {v.status === 'PAUSED' && <button className="btn" onClick={() => setStatus(v.id, 'ACTIVE')}>Resume</button>}
                {(v.status === 'ACTIVE' || v.status === 'PAUSED') && <button className="btn" onClick={() => setStatus(v.id, 'CLOSED')}>Close</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
