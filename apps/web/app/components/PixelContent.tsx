'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';

const CONTENT_TYPES = ['SERVICE_SHOWCASE', 'CLIENT_SUCCESS', 'TIP_VALUE', 'FESTIVAL_GREETING', 'BEHIND_SCENES', 'OFFER_PROMOTION'];
const label = (t: string) => t.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

interface Post {
  id: string;
  contentType: string;
  caption: string;
  hashtags: string[];
  imageDescription: string | null;
  status: string;
  weekNumber: number | null;
  createdAt: string;
}

interface Calendar {
  id?: string;
  theme?: string;
  weekNumber?: number;
  posts?: { day: string; contentType: string; topic: string; caption: string; hashtags: string[]; imageDescription: string }[];
}

const STATUS_COLORS: Record<string, string> = { DRAFT: 'var(--status-neutral)', APPROVED: 'var(--status-healthy)', POSTED: 'var(--accent-purple)' };

/** PIXEL's content studio: posts, weekly calendar, WhatsApp broadcasts. Mayank copies content out and tracks it here. */
export default function PixelContent() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [contentType, setContentType] = useState('SERVICE_SHOWCASE');
  const [topic, setTopic] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [industry, setIndustry] = useState('');
  const [offer, setOffer] = useState('');
  const [broadcast, setBroadcast] = useState('');

  async function load() {
    const [p, c] = await Promise.all([chairmanFetch<Post[]>('/marketing-content/posts'), chairmanFetch<Calendar>('/marketing-content/calendars/current')]);
    setPosts(p.data ?? []);
    setCalendar(c.data && c.data.id ? c.data : null);
    setError(p.error ?? c.error);
  }

  useEffect(() => {
    load();
  }, []);

  async function run(key: string, path: string, body?: any) {
    setBusy(key);
    setError(null);
    const r = await chairmanFetch<any>(path, { method: 'POST', body });
    if (r.error) setError(r.error);
    await load();
    setBusy(null);
    return r.data;
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setError('Clipboard not available — select the text and copy manually.');
    }
  }

  async function generateBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const data = await run('broadcast', '/marketing-content/whatsapp/broadcast', { targetIndustry: industry.trim(), offerType: offer.trim() });
    if (data?.message) setBroadcast(data.message);
  }

  if (!posts) return <div className="state-loading">Loading PIXEL content…</div>;

  const thisWeek = calendar?.weekNumber ? posts.filter((p) => p.weekNumber === calendar.weekNumber) : posts;
  const count = (s: string) => posts.filter((p) => p.status === s).length;
  const calendarPostsByCaption = new Map(posts.map((p) => [p.caption, p]));

  return (
    <div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        <div className="card"><div className="card-label">Posts this week</div><div className="card-value">{thisWeek.length}</div></div>
        <div className="card"><div className="card-label">Approved</div><div className="card-value" style={{ color: 'var(--status-healthy)' }}>{count('APPROVED')}</div></div>
        <div className="card"><div className="card-label">Drafts</div><div className="card-value">{count('DRAFT')}</div></div>
        <div className="card"><div className="card-label">Posted</div><div className="card-value" style={{ color: 'var(--accent-purple)' }}>{count('POSTED')}</div></div>
      </div>

      <form
        className="section"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) run('post', '/marketing-content/posts/generate', { contentType, topic: topic.trim() }).then((d) => d && setTopic(''));
        }}
      >
        <div className="section-title">PIXEL — generate content</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select aria-label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value)}>
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <input aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. Website for restaurants in Sikar" maxLength={500} style={{ flex: 1, minWidth: 200 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={!!busy || !topic.trim()}>{busy === 'post' ? 'PIXEL is writing… (~1 min)' : 'Generate post'}</button>
          <button className="btn btn-outline" type="button" disabled={!!busy || !!calendar} onClick={() => run('calendar', '/marketing-content/calendars/generate')}>
            {busy === 'calendar' ? 'Planning the week… (a few min)' : calendar ? 'This week’s calendar exists' : 'Generate week calendar'}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => setShowBroadcast(!showBroadcast)} aria-expanded={showBroadcast}>WhatsApp broadcast</button>
        </div>
      </form>

      {showBroadcast && (
        <form className="section" onSubmit={generateBroadcast}>
          <div className="section-title">WhatsApp broadcast</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input aria-label="Target industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry, e.g. gym" maxLength={100} style={{ flex: 1, minWidth: 160 }} />
            <input aria-label="Offer type" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Offer, e.g. free website demo" maxLength={200} style={{ flex: 1, minWidth: 160 }} />
            <button className="btn btn-primary" type="submit" disabled={!!busy || !industry.trim() || !offer.trim()}>{busy === 'broadcast' ? 'Writing… (~1 min)' : 'Generate message'}</button>
          </div>
          {broadcast && (
            <>
              <textarea aria-label="Broadcast message" readOnly value={broadcast} rows={6} style={{ width: '100%', resize: 'vertical' }} />
              <button className="btn btn-sm btn-outline mt-2" type="button" onClick={() => copy('broadcast', broadcast)}>{copied === 'broadcast' ? 'Copied' : 'Copy message'}</button>
            </>
          )}
        </form>
      )}

      <section className="section">
        <div className="section-title">This week’s calendar{calendar?.theme ? ` — “${calendar.theme}”` : ''}</div>
        {!calendar ? (
          <div className="state-empty">No calendar for this week yet. PIXEL makes one every Monday, or generate it above.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {(calendar.posts ?? []).map((d, i) => {
              const post = calendarPostsByCaption.get(d.caption);
              return (
                <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="flex-between">
                    <strong>{d.day}</strong>
                    <span className="badge badge-info">{label(d.contentType)}</span>
                  </div>
                  {d.topic && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{d.topic}</div>}
                  <div style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{d.caption.length > 160 ? `${d.caption.slice(0, 160)}…` : d.caption}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {post && post.status === 'DRAFT' && (
                      <button className="btn btn-sm btn-success" disabled={!!busy} onClick={() => run(post.id, `/marketing-content/posts/${post.id}/approve`)}>Approve</button>
                    )}
                    {post && post.status !== 'DRAFT' && <span className="badge" style={{ color: STATUS_COLORS[post.status] }}>{post.status}</span>}
                    <button className="btn btn-sm btn-outline" onClick={() => copy(`cc${i}`, d.caption)}>{copied === `cc${i}` ? '' : 'Copy caption'}</button>
                    <button className="btn btn-sm btn-outline" onClick={() => copy(`ch${i}`, d.hashtags.join(' '))}>{copied === `ch${i}` ? '' : 'Copy hashtags'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-title">Recent posts ({posts.length})</div>
        {posts.length === 0 ? (
          <div className="state-empty">No posts yet — generate one above, or say “generate instagram post about …” to the assistant.</div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} busy={busy} copied={copied} onRun={run} onCopy={copy} />)
        )}
      </section>
    </div>
  );
}

function PostCard({ post, busy, copied, onRun, onCopy }: {
  post: Post;
  busy: string | null;
  copied: string | null;
  onRun: (key: string, path: string) => void;
  onCopy: (key: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = post.caption.length > 100;
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${STATUS_COLORS[post.status] ?? 'var(--border-default)'}` }}>
      <div className="flex-between" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <span className="badge badge-info">{label(post.contentType)}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[post.status] }}>{post.status}</span>
      </div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-line' }}>
        {expanded || !long ? post.caption : `${post.caption.slice(0, 100)}…`}
        {long && (
          <button type="button" onClick={() => setExpanded(!expanded)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-blue)', marginLeft: 6, fontSize: 13 }}>
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </div>
      {post.hashtags.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--accent-cyan)', marginTop: 8 }}>
          {post.hashtags.slice(0, 5).join(' ')}{post.hashtags.length > 5 ? ` +${post.hashtags.length - 5}` : ''}
        </div>
      )}
      {post.imageDescription && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{post.imageDescription}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        {post.status === 'DRAFT' && <button className="btn btn-sm btn-success" disabled={!!busy} onClick={() => onRun(post.id, `/marketing-content/posts/${post.id}/approve`)}>Approve</button>}
        {post.status !== 'POSTED' && <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => onRun(post.id, `/marketing-content/posts/${post.id}/posted`)}>Mark as posted</button>}
        <button className="btn btn-sm btn-outline" onClick={() => onCopy(`pc${post.id}`, `${post.caption}\n\n${post.hashtags.join(' ')}`)}>
          {copied === `pc${post.id}` ? 'Copied' : 'Copy caption + hashtags'}
        </button>
      </div>
    </div>
  );
}
