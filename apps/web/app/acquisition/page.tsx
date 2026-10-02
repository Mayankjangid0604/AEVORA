'use client';
import { useEffect, useState } from 'react';

import { API_BASE } from '../lib/api';

async function apiFetch(path: string, options: RequestInit = {}) {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('aevora_jwt') : null;
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, data: null };
    return { data: await res.json(), error: null };
  } catch (e: any) {
    return { error: e.message, data: null };
  }
}

export default function AcquisitionConsole() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchDrafts();
  }, []);

  async function fetchDrafts() {
    setLoading(true);
    const { data, error } = await apiFetch('/outreach/drafts');
    if (error) setError('Unauthorized or failed to load drafts');
    else setDrafts(data || []);
    setLoading(false);
  }

  async function handleApprove(id: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { error } = await apiFetch(`/outreach/drafts/${id}/approve`, { method: 'POST' });
    if (error) {
      setError(`Failed to approve: ${error}`);
    } else {
      setSuccess('Draft approved and sent successfully!');
      fetchDrafts();
    }
    setLoading(false);
  }

  async function handleReject(id: string) {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { error } = await apiFetch(`/outreach/drafts/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (error) setError(`Failed to reject: ${error}`);
    else {
      setSuccess('Draft rejected.');
      fetchDrafts();
    }
    setLoading(false);
  }

  if (loading && drafts.length === 0) return <div className="state-loading">Loading acquisition console...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1>Chairman Acquisition Console</h1>
      <p>Approve or reject outbound communication drafts proposed by the AI.</p>

      {error && <div className="state-error" style={{ color: 'red', marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="state-success" style={{ color: 'green', marginBottom: 16 }}>✓ {success}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {drafts.length === 0 && !loading && (
          <div className="state-empty" style={{ padding: 24, border: '1px dashed #ccc', textAlign: 'center' }}>
            No drafts currently pending.
          </div>
        )}
        
        {drafts.map((draft) => (
          <div key={draft.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>To: {draft.recipientName} &lt;{draft.recipientEmail}&gt;</h3>
              <span style={{ padding: '4px 8px', borderRadius: 4, background: draft.status === 'PENDING_APPROVAL' ? '#fef08a' : '#ddd', fontSize: 12 }}>
                {draft.status}
              </span>
            </div>
            
            <div style={{ margin: '16px 0', padding: 12, background: '#f9fafb', borderRadius: 4 }}>
              <strong>Subject:</strong> {draft.subject}
              <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
              <div style={{ whiteSpace: 'pre-wrap' }}>{draft.messageBody}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14, color: '#4b5563', marginBottom: 16 }}>
              <div>
                <strong>Reason for Contact:</strong><br/>
                {draft.reasonForContact || 'N/A'}
              </div>
              <div>
                <strong>AI Qualification:</strong><br/>
                {draft.researchEvidence?.qualificationHypothesis || 'N/A'}
              </div>
            </div>

            {draft.status === 'PENDING_APPROVAL' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleApprove(draft.id)} style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Approve & Send
                </button>
                <button onClick={() => handleReject(draft.id)} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
