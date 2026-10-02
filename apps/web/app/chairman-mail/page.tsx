'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { chairmanFetch } from '../lib/api';
import { timeAgo } from '../components/ui';

interface MailRow { id: string; ref: string; category: string; title: string; status: 'OPEN' | 'REPLIED' | 'CLOSED'; readAt: string | null; createdAt: string; event: string; _count: { messages: number } }
interface MailMessage { id: string; from: 'CHAIRMAN' | 'ASSISTANT'; channel: 'EMAIL' | 'PORTAL_TEXT' | 'PORTAL_VOICE'; text: string; createdAt: string }
interface MailThread extends MailRow { body: string; emailedAt: string | null; messages: MailMessage[] }

const CATEGORY_COLOR: Record<string, string> = {
  Sales: 'var(--status-healthy)', Delivery: 'var(--accent-purple)', Team: 'var(--accent-blue)', Office: 'var(--status-caution)',
  CEO: 'var(--priority-important)', Money: 'var(--status-healthy)', Reports: 'var(--status-neutral)', 'Your email': 'var(--accent-blue)',
};
const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'by email', PORTAL_TEXT: 'typed', PORTAL_VOICE: 'by voice' };

/** Quick replies = the "- …" lines under "You can simply reply with:" in the email body. */
function quickReplies(body: string): string[] {
  const i = body.indexOf('You can simply reply with:');
  if (i < 0) return [];
  const out: string[] = [];
  for (const line of body.slice(i).split('\n').slice(1)) {
    if (!line.startsWith('- ')) break;
    const q = line.slice(2).split(' — ')[0].trim();
    if (q && !q.includes('<')) out.push(q);
  }
  return out;
}

export default function ChairmanMailPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return <Suspense fallback={<div className="state-loading">Loading Chairman Mail…</div>}><ChairmanMail /></Suspense>;
}

function ChairmanMail() {
  const params = useSearchParams();
  const [rows, setRows] = useState<MailRow[] | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN'>('ALL');
  const [selected, setSelected] = useState<string | null>(params.get('ref'));
  const [thread, setThread] = useState<MailThread | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const loadList = useCallback(async () => {
    const r = await chairmanFetch<MailRow[]>(`/chairman-mail${filter === 'OPEN' ? '?status=OPEN' : ''}`);
    if (r.data) setRows(r.data);
    if (r.error) setError(r.error);
    window.dispatchEvent(new Event('aevora:chairman-mail-changed'));
  }, [filter]);

  const loadThread = useCallback(async (id: string) => {
    const r = await chairmanFetch<MailThread>(`/chairman-mail/${encodeURIComponent(id)}`);
    if (r.data) setThread(r.data);
    if (r.error) setError(r.error);
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 20_000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selected && rows?.length) setSelected(rows[0].id);
  }, [rows, selected]);

  useEffect(() => {
    if (!selected) return;
    loadThread(selected).then(loadList);
    const t = setInterval(() => loadThread(selected), 15_000); // email replies show up here too
    return () => clearInterval(t);
  }, [selected, loadThread, loadList]);

  async function send(message: string, channel: 'PORTAL_TEXT' | 'PORTAL_VOICE') {
    if (!thread || !message.trim()) return;
    setSending(true);
    setError(null);
    const r = await chairmanFetch(`/chairman-mail/${thread.id}/reply`, { method: 'POST', body: { text: message.trim(), channel } });
    if (r.error) setError(r.error);
    else setText('');
    await loadThread(thread.id);
    await loadList();
    setSending(false);
  }

  function voice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('Voice needs Chrome or Edge. You can type instead.'); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      const said = e.results[0][0].transcript as string;
      setText(said);
      send(said, 'PORTAL_VOICE');
    };
    recognitionRef.current = rec;
    rec.start();
  }

  async function close() {
    if (!thread) return;
    await chairmanFetch(`/chairman-mail/${thread.id}/close`, { method: 'POST' });
    await loadThread(thread.id);
    await loadList();
  }

  if (!rows) return <div className="state-loading">Loading Chairman Mail…</div>;

  return (
    <>
      <div className="page-header">
        <h2>Chairman Mail</h2>
        <p>Everything the company emails you. Answer here by text or voice, or just reply to the email — both land in the same thread.</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex-between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
            <strong>{rows.length} message{rows.length === 1 ? '' : 's'}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['ALL', 'OPEN'] as const).map((f) => (
                <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f)}>{f === 'ALL' ? 'All' : 'Open'}</button>
              ))}
            </div>
          </div>
          {rows.length === 0 && <div className="state-empty" style={{ padding: 16 }}>Nothing yet. When the company needs you, it shows up here and in your email.</div>}
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {rows.map((m) => (
              <button key={m.id} type="button" onClick={() => setSelected(m.id)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderBottom: '1px solid var(--border-default)', background: thread?.id === m.id ? 'var(--bg-elevated)' : undefined, borderLeft: `3px solid ${CATEGORY_COLOR[m.category] ?? 'var(--border-default)'}` }}>
                <div className="flex-between" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12, color: CATEGORY_COLOR[m.category] ?? 'var(--text-muted)' }}>{m.category} · {m.ref}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(m.createdAt)}</span>
                </div>
                <div className="truncate" style={{ fontWeight: m.readAt ? 400 : 700, marginTop: 2 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {m.status === 'OPEN' ? (m.readAt ? 'Open' : 'New') : m.status === 'REPLIED' ? `Answered · ${m._count.messages} messages` : 'Closed'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {thread ? (
          <div className="card">
            <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: CATEGORY_COLOR[thread.category] ?? 'var(--text-muted)' }}>{thread.category} · {thread.ref} · {new Date(thread.createdAt).toLocaleString('en-IN')}</div>
                <h3 style={{ margin: '4px 0 0' }}>{thread.title}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{thread.emailedAt ? 'Also sent to your email' : 'Not emailed (check SMTP settings)'}</div>
              </div>
              {thread.status !== 'CLOSED' && <button className="btn btn-outline btn-sm" onClick={close}>Mark done</button>}
            </div>

            <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-elevated)', padding: 14, borderRadius: 'var(--radius-md)', marginTop: 12, fontSize: 14, lineHeight: 1.55 }}>
              {thread.body.replace(/\n\nOpen in portal:[\s\S]*$/, '')}
            </div>

            {thread.messages.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {thread.messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.from === 'CHAIRMAN' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.from === 'CHAIRMAN' ? 'var(--accent-blue)' : 'var(--bg-elevated)', color: m.from === 'CHAIRMAN' ? '#fff' : 'inherit', padding: '8px 12px', borderRadius: 12 }}>
                    <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{m.from === 'CHAIRMAN' ? `You (${CHANNEL_LABEL[m.channel]})` : 'Assistant'} · {timeAgo(m.createdAt)}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.text}</div>
                  </div>
                ))}
              </div>
            )}

            {thread.status !== 'CLOSED' && (
              <div style={{ marginTop: 16 }}>
                {quickReplies(thread.body).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {quickReplies(thread.body).map((q) => (
                      <button key={q} className="btn btn-outline btn-sm" disabled={sending} onClick={() => send(q, 'PORTAL_TEXT')}>{q}</button>
                    ))}
                  </div>
                )}
                <label className="field" style={{ marginBottom: 8 }}>
                  <span>Your answer (instructions for your Assistant{thread.event.startsWith('inbound.') ? ' — start with "REPLY:" to send your own text to the client' : ''})</span>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} style={{ resize: 'vertical' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(text, 'PORTAL_TEXT'); }} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={sending || !text.trim()} onClick={() => send(text, 'PORTAL_TEXT')}>{sending ? 'Working…' : 'Send'}</button>
                  <button className={`btn ${listening ? 'btn-primary' : 'btn-outline'}`} disabled={sending} onClick={voice} aria-pressed={listening}>
                    {listening ? '● Listening… (click to stop)' : '🎤 Speak'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card state-empty">Select a message.</div>
        )}
      </div>
    </>
  );
}
