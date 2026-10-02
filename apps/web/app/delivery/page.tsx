'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { formatINR, timeAgo } from '../components/ui';

const COLUMNS = [
  { key: 'SCOPING', label: 'Scoping', statuses: ['SCOPING'] },
  { key: 'BUILDING', label: 'Building', statuses: ['BUILDING', 'REVISION'] },
  { key: 'SAMPLE_SENT', label: 'Sample sent', statuses: ['SAMPLE_SENT'] },
  { key: 'APPROVED', label: 'Approved / invoiced', statuses: ['APPROVED', 'INVOICED'] },
  { key: 'PAID', label: 'Paid', statuses: ['PAID', 'CLOSED'] },
];

export default function DeliveryPage() {
  const [projects, setProjects] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await chairmanFetch<any[]>('/delivery/projects');
    setProjects(r.data ?? []);
    setError(r.error);
  }
  useEffect(() => { load(); }, []);

  async function post(id: string, path: string, body?: any) {
    setBusy(id);
    const r = await chairmanFetch(path, { method: 'POST', body });
    if (r.error) setError(r.error);
    await load();
    setBusy(null);
  }

  function revise(p: any) {
    const feedback = window.prompt(`Client feedback for ${p.lead?.name}:`);
    if (feedback?.trim()) post(p.id, `/delivery/projects/${p.id}/revision`, { feedback });
  }

  function markPaid(p: any) {
    const ref = window.prompt(`Payment reference for ${p.lead?.name} (${formatINR(p.quotedAmount)}), e.g. UPI txn id:`);
    if (ref?.trim()) post(p.id, `/delivery/projects/${p.id}/mark-paid`, { idempotencyKey: `manual:${ref.trim()}`, paymentRef: ref.trim() });
  }

  if (!projects) return <div className="state-loading">Loading delivery…</div>;

  return (
    <>
      <div className="page-header">
        <h2>Delivery</h2>
        <p>Client projects from discovery to payment</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}
      <button className="btn" style={{ marginBottom: 16 }} disabled={!!busy} onClick={() => post('all', '/delivery/process')}>
        Run delivery agent now
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(220px, 1fr))`, gap: 12, overflowX: 'auto' }}>
        {COLUMNS.map((col) => {
          const items = projects.filter((p) => col.statuses.includes(p.status));
          return (
            <div key={col.key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 10, minHeight: 200 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>{col.label} ({items.length})</div>
              {items.map((p) => (
                <div key={p.id} className="card" style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{p.lead?.name}</div>
                  <div className="card-sub">{p.projectType} · {p.status}{p.revisionCount ? ` · rev ${p.revisionCount}` : ''}</div>
                  <div className="card-sub">{p.scope?.title ?? 'Not scoped yet'}</div>
                  <div className="money" style={{ marginTop: 4 }}>{formatINR(p.quotedAmount)}</div>
                  {p.error && <div style={{ color: 'var(--status-critical)', fontSize: 12, marginTop: 4 }}>{p.error}</div>}
                  <div className="card-sub">{timeAgo(p.updatedAt)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {p.sampleUrl && <a className="btn" href={p.sampleUrl} target="_blank" rel="noreferrer">Sample</a>}
                    {p.status === 'SAMPLE_SENT' && (
                      <>
                        <button className="btn" disabled={busy === p.id} onClick={() => post(p.id, `/delivery/projects/${p.id}/approve`)}>Client approved</button>
                        <button className="btn" disabled={busy === p.id} onClick={() => revise(p)}>Revision</button>
                      </>
                    )}
                    {p.status === 'INVOICED' && (
                      <>
                        {p.paymentLinkUrl && <a className="btn" href={p.paymentLinkUrl} target="_blank" rel="noreferrer">Pay link</a>}
                        <button className="btn" disabled={busy === p.id} onClick={() => markPaid(p)}>Mark paid</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
