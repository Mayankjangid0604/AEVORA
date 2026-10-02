'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge, timeAgo } from '../components/ui';

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'approve' | 'reject'; title: string } | null>(null);

  useEffect(() => { loadDecisions(); }, []);

  async function loadDecisions() {
    setLoading(true);
    const res = await api.decisions();
    if (res.error) setError(res.error);
    else setDecisions(res.data || []);
    setLoading(false);
  }

  async function handleAction() {
    if (!confirm) return;
    setActionLoading(confirm.id);
    const res = confirm.action === 'approve'
      ? await api.approveDecision(confirm.id)
      : await api.rejectDecision(confirm.id);
    setActionLoading(null);
    setConfirm(null);
    if (!res.error) await loadDecisions();
  }

  if (loading) return <div className="state-loading">Loading decisions…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  const pending = decisions.filter(d => d.status === 'PROPOSED');
  const resolved = decisions.filter(d => d.status !== 'PROPOSED');

  return (
    <>
      <div className="page-header">
        <h2>🔴 Chairman Decisions</h2>
        <p>{pending.length} pending · {resolved.length} resolved</p>
      </div>

      {pending.length > 0 && (
        <div className="section">
          <h3 className="section-title">Pending Decisions</h3>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Title</th><th>Proposer</th><th>Target</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {pending.map((d: any) => (
                <tr key={d.id}>
                  <td><StatusBadge status={d.type} /></td>
                  <td>{d.title}<br/><span style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>{d.description}</span></td>
                  <td>{d.proposer?.name || '—'}</td>
                  <td>{d.targetEmployee?.name || '—'}</td>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'}}>{timeAgo(d.createdAt)}</td>
                  <td>
                    <div className="action-bar">
                      <button
                        className="btn btn-success btn-sm"
                        disabled={actionLoading === d.id}
                        onClick={() => setConfirm({ id: d.id, action: 'approve', title: d.title })}
                      >Approve</button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={actionLoading === d.id}
                        onClick={() => setConfirm({ id: d.id, action: 'reject', title: d.title })}
                      >Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="section">
          <h3 className="section-title">Resolved Decisions</h3>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {resolved.map((d: any) => (
                <tr key={d.id}>
                  <td><StatusBadge status={d.type} /></td>
                  <td>{d.title}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'}}>{timeAgo(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div className="dialog-overlay" onClick={() => setConfirm(null)}>
          <div className="dialog-box" onClick={e => e.stopPropagation()}>
            <h3>{confirm.action === 'approve' ? '✓ Approve' : '✕ Reject'} Decision</h3>
            <p>Are you sure you want to <strong>{confirm.action}</strong> the decision: <strong>{confirm.title}</strong>?</p>
            <div className="dialog-actions">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={`btn ${confirm.action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                onClick={handleAction}
                disabled={!!actionLoading}
              >
                {actionLoading ? 'Processing…' : confirm.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
