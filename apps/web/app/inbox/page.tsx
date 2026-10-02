'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { timeAgo } from '../components/ui';

interface InboundMessage {
  id: string;
  channel: string;
  fromAddress: string;
  subject: string | null;
  body: string;
  status: 'NEW' | 'PROCESSED' | 'REPLIED' | 'IGNORED';
  extractedIntent: string | null;
  confidence: number | null;
  draftReply: string | null;
  metadata: { feedback?: string | null };
  lead: { id: string; name: string } | null;
  receivedAt: string | null;
  createdAt: string;
}

interface CheckResult {
  checked: number;
  newMessages: number;
  classified: number;
  skipped?: string;
}

const INTENT_COLORS: Record<string, string> = {
  INTERESTED: 'var(--status-healthy)',
  APPROVAL: 'var(--status-healthy)',
  NOT_INTERESTED: 'var(--status-critical)',
  ASKING_PRICE: 'var(--accent-blue)',
  QUESTION: 'var(--priority-important)',
  REVISION: 'var(--accent-purple)',
  SPAM: 'var(--status-neutral)',
  UNKNOWN: 'var(--status-caution)',
};

const STATUS_LABELS: Record<string, string> = { NEW: 'Unread', PROCESSED: 'Classified', REPLIED: 'Replied', IGNORED: 'Ignored' };
const needsAttention = (m: InboundMessage) => m.status === 'NEW' || m.status === 'PROCESSED';
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

export default function InboxPage() {
  const [messages, setMessages] = useState<InboundMessage[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<{ at: Date; result: CheckResult } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [m, c] = await Promise.all([
      chairmanFetch<InboundMessage[]>('/inbox/messages'),
      chairmanFetch<{ count: number; enabled: boolean }>('/inbox/unread-count'),
    ]);
    setMessages(m.data ?? []);
    if (c.data) setEnabled(c.data.enabled);
    setError(m.error ?? c.error);
    window.dispatchEvent(new Event('aevora:inbox-changed'));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function checkNow() {
    setChecking(true);
    const r = await chairmanFetch<CheckResult>('/inbox/check', { method: 'POST' });
    if (r.data) setLastCheck({ at: new Date(), result: r.data });
    if (r.error) setError(r.error);
    await load();
    setChecking(false);
  }

  async function act(id: string, path: string, body?: any) {
    setBusyId(id);
    const r = await chairmanFetch(`/inbox/messages/${id}/${path}`, { method: 'POST', body });
    if (r.error) setError(r.error);
    await load();
    setBusyId(null);
  }

  if (!messages) return <div className="state-loading">Loading inbox…</div>;

  const attention = messages.filter(needsAttention);
  const replied = messages.filter((m) => m.status === 'REPLIED').length;
  const interested = messages.filter((m) => m.extractedIntent === 'INTERESTED' || m.extractedIntent === 'APPROVAL').length;

  return (
    <>
      <div className="page-header">
        <h2>Inbox</h2>
        <p>Client replies read from Gmail and classified automatically</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      {enabled === false && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--status-caution)' }}>
          <strong>Inbox reading is off.</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
            <li>Gmail (the SMTP_USER mailbox) → Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save</li>
            <li>Set <code>INBOX_ENABLED=true</code> in <code>.env</code></li>
            <li>Restart the API (start.bat)</li>
          </ol>
        </div>
      )}

      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        <div className="card"><div className="card-label">Total messages</div><div className="card-value">{messages.length}</div></div>
        <div className="card"><div className="card-label">Needs attention</div><div className="card-value" style={{ color: 'var(--status-caution)' }}>{attention.length}</div></div>
        <div className="card"><div className="card-label">Replied</div><div className="card-value">{replied}</div></div>
        <div className="card"><div className="card-label">Interested leads</div><div className="card-value" style={{ color: 'var(--status-healthy)' }}>{interested}</div></div>
      </div>

      <section className="section">
        <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {lastCheck
              ? lastCheck.result.skipped
                ? `Last check ${lastCheck.at.toLocaleTimeString()}: skipped — ${lastCheck.result.skipped}`
                : `Last check ${lastCheck.at.toLocaleTimeString()}: ${lastCheck.result.checked} emails scanned, ${lastCheck.result.newMessages} new lead replies`
              : 'Auto-checks every 10 minutes while the simulation is running. Only replies from known leads are read.'}
          </div>
          <button className="btn btn-primary" onClick={checkNow} disabled={checking}>
            {checking ? 'Checking… (classifying can take a minute per reply)' : 'Check inbox now'}
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-title">Needs attention ({attention.length})</div>
        {attention.length === 0 ? (
          <div className="state-empty">Nothing waiting. New client replies show up here.</div>
        ) : (
          attention.map((m) => <MessageCard key={m.id} m={m} busy={busyId === m.id} onAct={act} actionable />)
        )}
      </section>

      <section className="section">
        <div className="section-title">All messages ({messages.length})</div>
        {messages.length === 0 ? (
          <div className="state-empty">No messages yet.</div>
        ) : (
          messages.map((m) => <MessageCard key={m.id} m={m} busy={busyId === m.id} onAct={act} collapsed />)
        )}
      </section>
    </>
  );
}

function MessageCard({ m, busy, onAct, actionable = false, collapsed = false }: {
  m: InboundMessage;
  busy: boolean;
  onAct: (id: string, path: string, body?: any) => void;
  actionable?: boolean;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [showFull, setShowFull] = useState(false);
  const [reply, setReply] = useState(m.draftReply ?? '');
  const intent = m.extractedIntent ?? 'UNKNOWN';
  const canReply = actionable && m.channel === 'EMAIL' && (intent === 'QUESTION' || intent === 'ASKING_PRICE');
  const long = m.body.length > 200;

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${INTENT_COLORS[intent] ?? 'var(--border-default)'}` }}>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <strong>{m.lead?.name ?? m.fromAddress}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{m.fromAddress}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge" style={{ color: INTENT_COLORS[intent] }}>{label(intent)}</span>
            {m.confidence !== null && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(m.confidence * 100)}%</span>}
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{STATUS_LABELS[m.status]}</span>
          </div>
        </div>
        <div className="truncate" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{m.subject ?? '(no subject)'} · {timeAgo(m.receivedAt ?? m.createdAt)}</div>
      </button>

      {expanded && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          {m.metadata?.feedback && <p style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>{m.metadata.feedback}</p>}
          <div style={{ whiteSpace: 'pre-line', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: 10, borderRadius: 'var(--radius-md)' }}>
            {showFull || !long ? m.body : `${m.body.slice(0, 200)}…`}
            {long && (
              <button type="button" onClick={() => setShowFull(!showFull)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-blue)', marginLeft: 6, fontSize: 13 }}>
                {showFull ? 'less' : 'more'}
              </button>
            )}
          </div>

          {canReply && (
            <div style={{ marginTop: 12 }}>
              <label className="field" style={{ marginBottom: 8 }}>
                <span>Reply (AI draft — edit before sending; the team signature is added automatically)</span>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} maxLength={5000} style={{ resize: 'vertical' }} />
              </label>
              <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={() => onAct(m.id, 'reply', { replyText: reply.trim() })}>
                {busy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          )}

          {actionable && (
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onAct(m.id, 'ignore')}>Ignore</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
