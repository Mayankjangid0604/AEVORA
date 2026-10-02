'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, authHeaders, chairmanFetch } from '../lib/api';

interface Line { speakerId: string; speakerName: string; text: string; at: string; agendaIndex: number }
interface Meeting {
  id: string; title: string; status: string; importance: string; ledBy: 'CHAIRMAN' | 'ASSISTANT' | null; scheduledAt: string;
  rescheduleCount: number; summary: string | null; summaryFilePath: string | null; currentAgendaIndex: number; transcript: Line[];
  agendaItems: { title: string }[]; participants: { employeeId: string; employee: { name: string; role?: { title: string } } }[];
}

const OPEN = ['SCHEDULED', 'NOTIFIED', 'RESCHEDULED'];
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function BoardroomPage() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', agenda: '', importance: 'NORMAL', at: localInput(new Date(Date.now() + 3600_000)) });

  const load = useCallback(async () => {
    const r = await chairmanFetch<Meeting[]>('/boardroom/meetings');
    if (r.data) setMeetings(r.data);
    setError(r.error);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const act = async (id: string, op: string, body?: Record<string, unknown>) => {
    setBusy(true);
    const r = await chairmanFetch(`/boardroom/meetings/${encodeURIComponent(id)}/${op}`, { method: 'POST', body });
    setBusy(false);
    if (r.error) setError(r.error); else load();
  };

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await chairmanFetch('/boardroom/meetings', {
      method: 'POST',
      body: { title: form.title, agenda: form.agenda.split('\n').map((s) => s.trim()).filter(Boolean), importance: form.importance, scheduledAt: new Date(form.at).toISOString() },
    });
    setBusy(false);
    if (r.error) setError(r.error); else { setForm({ ...form, title: '', agenda: '' }); load(); }
  };

  const downloadSummary = async (m: Meeting) => {
    const res = await fetch(`${API_BASE}/boardroom/meetings/${m.id}/summary-file`, { headers: authHeaders() });
    if (!res.ok) return setError(`Summary file: ${res.status}`);
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `board-meeting-${m.id}.pdf`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const m = meetings?.find((x) => x.id === selected) ?? null;
  return (
    <>
      <div className="page-header">
        <h2>Boardroom</h2>
        <p>Board meetings with your CEO and department heads. Join to lead, or let your Assistant lead and send you the summary.</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      <form className="card" onSubmit={schedule} style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
        <div className="card-label">Schedule a board meeting</div>
        <input className="input" required maxLength={200} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" />
        <textarea className="input" required rows={3} placeholder="Agenda — one item per line" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} aria-label="Agenda" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })} aria-label="Importance">
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((i) => <option key={i}>{i}</option>)}
          </select>
          <input className="input" type="datetime-local" required value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} aria-label="Start time" />
          <button className="btn btn-primary" disabled={busy}>Schedule</button>
        </div>
      </form>

      {meetings === null ? <div className="state-loading">Loading meetings…</div> : meetings.length === 0 ? <div className="state-empty">No board meetings yet.</div> : (
        <div className="card" style={{ marginBottom: 16 }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Meeting</th><th>When</th><th>Status</th><th>Lead</th><th /></tr></thead>
            <tbody>
              {meetings.map((x) => (
                <tr key={x.id} style={{ cursor: 'pointer', background: x.id === selected ? 'var(--bg-hover, rgba(255,255,255,0.04))' : undefined }} onClick={() => setSelected(x.id)}>
                  <td>{x.importance === 'URGENT' ? '🔴 ' : ''}{x.title}</td>
                  <td>{new Date(x.scheduledAt).toLocaleString('en-IN')}</td>
                  <td>{x.status}</td>
                  <td>{x.ledBy === 'ASSISTANT' ? 'Assistant' : x.ledBy === 'CHAIRMAN' ? 'You' : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {OPEN.includes(x.status) && <>
                      <button className="btn btn-secondary" disabled={busy} onClick={() => act(x.id, 'join')}>Join</button>{' '}
                      <button className="btn btn-secondary" disabled={busy} onClick={() => act(x.id, 'delegate')}>Assistant leads</button>{' '}
                      <button className="btn btn-secondary" disabled={busy} onClick={() => act(x.id, 'reschedule', { scheduledAt: new Date(new Date(x.scheduledAt).getTime() + 86400_000).toISOString() })}>+1 day</button>{' '}
                    </>}
                    {(OPEN.includes(x.status) || x.status === 'IN_PROGRESS') && <button className="btn btn-secondary" disabled={busy} onClick={() => act(x.id, 'cancel')}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {m && (
        <div className="card">
          <div className="card-label">{m.title} · {m.status}</div>
          <p style={{ fontSize: 13 }}>Attending: {m.participants.map((p) => `${p.employee.name}${p.employee.role ? ` (${p.employee.role.title})` : ''}`).join(', ')}</p>
          <ol style={{ fontSize: 13 }}>{m.agendaItems.map((a, i) => <li key={i} style={{ fontWeight: i === m.currentAgendaIndex && m.status === 'IN_PROGRESS' ? 700 : 400 }}>{a.title}</li>)}</ol>
          {m.status === 'IN_PROGRESS' && <p style={{ fontSize: 13 }}>Live now: open the 3D office and walk to the Boardroom to hear it, or <button className="btn btn-secondary" disabled={busy} onClick={() => act(m.id, 'end')}>End meeting</button></p>}
          <div className="card-label" style={{ marginTop: 12 }}>Transcript</div>
          {m.transcript.length === 0 ? <div className="state-empty">Nobody has spoken yet.</div>
            : m.transcript.map((l, i) => <p key={i} style={{ fontSize: 13, margin: '4px 0' }}><strong>{l.speakerName}:</strong> {l.text}</p>)}
          {m.summary && <>
            <div className="card-label" style={{ marginTop: 12 }}>Summary</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{m.summary}</pre>
            {m.summaryFilePath && <button className="btn btn-secondary" onClick={() => downloadSummary(m)}>Download PDF</button>}
          </>}
        </div>
      )}
    </>
  );
}
