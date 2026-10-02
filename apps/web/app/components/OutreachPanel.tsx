'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { formatINR, timeAgo } from './ui';

const FUNNEL = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'] as const;
const OPEN_PROJECT = ['SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED'];

export default function OutreachPanel() {
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [l, c, p] = await Promise.all([
      chairmanFetch<any[]>('/lead-gen/leads'),
      chairmanFetch<any[]>('/outreach/campaigns'),
      chairmanFetch<any[]>('/delivery/projects'),
    ]);
    setLeads(l.data ?? []);
    setCampaigns(c.data ?? []);
    setProjects(p.data ?? []);
    setError(l.error || c.error || p.error);
  }

  useEffect(() => { load(); }, []);

  async function act(path: string) {
    setBusy(true);
    const r = await chairmanFetch(path, { method: 'POST' });
    if (r.error) setError(r.error);
    await load();
    setBusy(false);
  }

  const counts = Object.fromEntries(FUNNEL.map((s) => [s, leads.filter((l) => l.status === s).length]));
  const max = Math.max(1, ...Object.values(counts));
  const pipeline = projects.filter((p) => OPEN_PROJECT.includes(p.status)).reduce((s, p) => s + (p.quotedAmount ?? 0), 0);
  const won = projects.filter((p) => p.status === 'PAID' || p.status === 'CLOSED').reduce((s, p) => s + (p.quotedAmount ?? 0), 0);

  return (
    <>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn" disabled={busy} onClick={() => act('/lead-gen/trigger')}>Find leads now</button>
        <button className="btn" disabled={busy} onClick={() => act('/outreach/process')}>Contact next leads</button>
      </div>

      <div className="metrics-grid">
        <div className="card"><div className="card-label">Lead-gen leads</div><div className="card-value">{leads.length}</div></div>
        <div className="card"><div className="card-label">Campaigns</div><div className="card-value">{campaigns.length}</div></div>
        <div className="card"><div className="card-label">Open pipeline</div><div className="card-value">{formatINR(pipeline)}</div></div>
        <div className="card"><div className="card-label">Won (paid)</div><div className="card-value">{formatINR(won)}</div></div>
      </div>

      <div className="section">
        <div className="section-title">Lead funnel</div>
        {FUNNEL.map((s) => (
          <div key={s} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 48px', alignItems: 'center', gap: 12, margin: '6px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s}</span>
            <div style={{ background: 'var(--bg-input)', borderRadius: 4, height: 14 }}>
              <div style={{ width: `${(counts[s] / max) * 100}%`, background: 'var(--accent-blue)', height: '100%', borderRadius: 4 }} />
            </div>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{counts[s]}</span>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">Outreach campaigns</div>
        {campaigns.length === 0 ? (
          <div className="state-empty">No campaigns yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Business</th><th>Channel</th><th>Status</th><th>Outcome</th><th>Score</th><th>Created</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.lead?.name}</td>
                    <td>{c.channel}</td>
                    <td>{c.status}{c.error ? ' ⚠' : ''}</td>
                    <td>{c.outcome ?? '—'}</td>
                    <td>{c.lead?.qualityScore ?? '—'}</td>
                    <td>{timeAgo(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
