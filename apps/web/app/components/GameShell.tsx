'use client';

// The game shell: the walkable Three.js office (public/office/Aevora_Office_3D_v3.html) fills the screen and
// never unmounts, so leaving OfficeOS puts you back exactly where you stood. Every route except "/" renders
// inside the OfficeOS window over it. Bridge: the office posts OFFICE_READY / ROOM_ENTER / CLICK_ROOM /
// DESK_NEAR / DESK_LOGIN / SEAT_NEAR / ASSISTANT_TALK; we send FOCUS_ZONE and ASSISTANT_NOTE. Signed out, the world is scenery only (no API calls).

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { chairmanFetch, getToken, openCompanyStream } from '../lib/api';
import { postToOffice, runOfficeAction, useCompanyDataFeed, type OfficeAction } from '../lib/officeLink';
import { DEPARTMENTS, getEmployeeColor, groupByRoom, type Department, type WorldEmployee } from '../world/office-layout';
import { useLiveValues } from '../world/useLiveValues';
import OfficeOS from './OfficeOS';

interface WorldData { employees: WorldEmployee[] }
interface OfficeMessage { source: 'aevora-office'; type: string; data?: { key?: string; name?: string; near?: boolean; prompt?: string; id?: string; from?: string; at?: number; speakerId?: string | null } & Partial<OfficeAction> }
/** One line in the conversation panel: everything said in the office, the Chairman's own lines included. */
interface TalkLine { from: string; text: string; at: number; speakerId: string | null; mine: boolean }
const TALK_KEY = 'aevora_talk_log';
const loadTalk = (): TalkLine[] => { try { return JSON.parse(localStorage.getItem(TALK_KEY) ?? '[]'); } catch { return []; } };

const OFFICE_SRC = '/office/Aevora_Office_3D_v3.html';
const zoneKey = (n: string) => n.toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
const DEPT_BY_ZONE = new Map(DEPARTMENTS.map((d) => [zoneKey(d.name), d]));
const HINT = 'Double-click to walk · W A S D to move · drag to look · find your desk in the Chairman Office · E to sit · click your assistant to talk';

export default function GameShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const inOs = pathname !== '/';
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [seatPrompt, setSeatPrompt] = useState('');
  const [talkTo, setTalkTo] = useState<{ kind: 'assistant' | 'employee'; id?: string; name: string } | null>(null);
  // Part 19: one-on-one panel (employee record from /chairman/employees/:id + the office's observed work diary)
  const [oneOnOne, setOneOnOne] = useState<{ id: string; name: string; record?: Record<string, unknown> | null; diary?: { at: string; text: string }[] } | null>(null);
  // Items 24 + 27: the quest system and the attendance streak were removed; clear what they left in the browser.
  useEffect(() => { try { localStorage.removeItem('aevora_streak'); localStorage.removeItem('aevora_quests'); } catch { /* private mode */ } }, []);
  const [note, setNote] = useState('');
  // Conversation panel: every reply (and your own lines) so nothing is missed; per-browser convenience copy only.
  const [talk, setTalk] = useState<TalkLine[]>([]);
  const [talkOpen, setTalkOpen] = useState(false);
  const [talkSeen, setTalkSeen] = useState(0);
  useEffect(() => { const t = loadTalk(); setTalk(t); setTalkSeen(t.length); }, []);
  useEffect(() => { try { localStorage.setItem(TALK_KEY, JSON.stringify(talk.slice(-200))); } catch { /* private mode */ } }, [talk]);
  useEffect(() => { if (talkOpen) setTalkSeen(talk.length); }, [talkOpen, talk.length]);
  const unread = talk.slice(talkSeen).filter((l) => !l.mine).length;
  const [here, setHere] = useState('');
  const [room, setRoom] = useState<{ key: string; name: string } | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [data, setData] = useState<WorldData | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const liveValues = useLiveValues();
  // #46: ask an employee out loud — one browser speech-recognition result becomes the chat question.
  const [listening, setListening] = useState(false);
  const askByVoice = (t: { id?: string; name: string }) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !t.id) return postToOffice(frameRef, 'SPEECH', { from: 'System', text: 'Voice input needs Chrome or Edge.' });
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const text = String(e.results[0]?.[0]?.transcript ?? '').trim(); if (!text) return;
      postToOffice(frameRef, 'SPEECH', { from: 'You', text });
      setTalkTo(null); setNote('');
      runOfficeAction({ kind: 'employeeChat', id: t.id, name: t.name, text }, { frame: frameRef, push: (h) => router.push(h), signedIn });
    };
    r.onerror = (e: any) => postToOffice(frameRef, 'SPEECH', { from: 'System', text: e.error === 'not-allowed' ? 'Microphone blocked — allow it in the address bar.' : `Didn't catch that (${e.error}).` });
    r.onend = () => { setListening(false); frameRef.current?.focus(); };
    setListening(true); r.start();
  };

  const load = useCallback(async () => {
    const tokenNow = !!getToken();
    setSignedIn(tokenNow);
    if (!tokenNow) return setData(null);
    reportChairs();
    const r = await chairmanFetch<WorldData>('/chairman/world');
    if (r.data) setData(r.data);
  }, []);

  // Desk chairs per room = the CEO's hiring limit per department. Sent once per change (the office counts them).
  const chairsSent = useRef('');
  const reportChairs = useCallback(() => {
    const read = (frameRef.current?.contentWindow as (Window & { aevoraChairs?: () => { key: string; name: string; chairs: number }[] }) | null)?.aevoraChairs;
    if (!read || !getToken()) return;
    let rooms: { key: string; name: string; chairs: number }[];
    try { rooms = read(); } catch { return; }
    const sig = JSON.stringify(rooms);
    if (!rooms.length || sig === chairsSent.current) return;
    chairsSent.current = sig;
    chairmanFetch('/ceo/staffing/office-rooms', { method: 'POST', body: { rooms } }).then((r) => { if (r.error) chairsSent.current = ''; });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const out = () => setSignedIn(false); // any 401 (expired session) → screens stop at once
    window.addEventListener('aevora:unauthorized', out);
    return () => { clearInterval(t); window.removeEventListener('aevora:unauthorized', out); };
  }, [load]);

  // The office uses the web app's own session (the same JWT the pages use). No session yet → send the Chairman to
  // sign in once per browser session, then straight back here. Company data stays behind the API's auth either way.
  useEffect(() => {
    if (inOs || getToken()) return;
    try { if (sessionStorage.getItem('aevora_login_prompted')) return; sessionStorage.setItem('aevora_login_prompted', '1'); } catch { return; }
    router.push('/os?next=%2F');
  }, [inOs, router]);

  // The office may have finished before hydration (missed OFFICE_READY and onLoad): check once on mount.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.readyState === 'complete' && !doc.getElementById('loading')) setReady(true);
  }, []);

  const login = useCallback(() => { router.push('/os'); }, [router]);

  useEffect(() => {
    function onMessage(e: MessageEvent<OfficeMessage>) {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source !== 'aevora-office') return;
      const { type, data: d } = e.data;
      if (type === 'OFFICE_READY') { setReady(true); reportChairs(); }
      if (type === 'ROOM_ENTER') setHere(d?.name ?? '');
      if (type === 'DESK_NEAR') setNear(!!d?.near);
      if (type === 'SEAT_NEAR') setSeatPrompt(d?.prompt ?? '');
      if (type === 'ASSISTANT_TALK') setTalkTo({ kind: 'assistant', name: 'your assistant' });
      if (type === 'EMPLOYEE_TALK' && d?.id) setTalkTo({ kind: 'employee', id: d.id, name: d.name ?? 'employee' });
      if (type === 'SPEECH_LINE' && d?.text && !(d.from === 'System' && /thinking…$/.test(d.text))) {
        const line: TalkLine = { from: d.from ?? '', text: d.text, at: d.at ?? Date.now(), speakerId: d.speakerId ?? null, mine: d.from === 'You' || d.speakerId === 'chairman' };
        setTalk((t) => (t.length && t[t.length - 1].text === line.text && t[t.length - 1].from === line.from ? t : [...t, line].slice(-200)));
      }
      if (type === 'WORK_DIARY' && d?.id) setOneOnOne((o) => (o && o.id === d.id ? { ...o, diary: (d as { entries?: { at: string; text: string }[] }).entries ?? [] } : o));
      if (type === 'ACTION' && d?.kind) runOfficeAction(d as OfficeAction, { frame: frameRef, push: (h) => router.push(h), signedIn: !!getToken() });
      if (type === 'ASSISTANT_CMD' && d?.text) runOfficeAction({ kind: 'assistant', text: d.text }, { frame: frameRef, push: (h) => router.push(h), signedIn: !!getToken() });
      if (type === 'CEO_CMD' && d?.text) runOfficeAction({ kind: 'ceoCommand', text: d.text }, { frame: frameRef, push: (h) => router.push(h), signedIn: !!getToken() });
      if (type === 'BROADCAST_CMD' && d?.text) runOfficeAction({ kind: 'broadcast', text: d.text }, { frame: frameRef, push: (h) => router.push(h), signedIn: !!getToken() });
      if (type === 'DESK_LOGIN') login();
      if (type === 'CLICK_ROOM' && d?.key) { setRoom({ key: d.key, name: d.name ?? d.key }); setPersonId(null); }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [login, router, reportChairs]);

  // Enter at the desk also works when focus is on the shell rather than inside the office iframe.
  useEffect(() => {
    if (inOs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && near && !(e.target as HTMLElement | null)?.closest?.('input, textarea')) login(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inOs, near, login]);

  // Part 13: the office spawns one character per ACTIVE employee from this list (empty when signed out).
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ target: 'aevora-office', type: 'EMPLOYEES', data: { employees: signedIn ? data?.employees ?? [] : [] } }, window.location.origin);
  }, [ready, signedIn, data]);

  // Part 13 Task 5: model gateway health (read-only /health/models) → employees are absent while it's down.
  useEffect(() => {
    if (!ready || !signedIn) return;
    const post = async () => {
      const r = await chairmanFetch<{ status: string; message: string }>('/health/models');
      const data = r.data ?? { status: 'error', message: r.error ?? 'unreachable' };
      frameRef.current?.contentWindow?.postMessage({ target: 'aevora-office', type: 'MODEL_HEALTH', data }, window.location.origin);
    };
    post(); const t = setInterval(post, 30_000);
    return () => clearInterval(t);
  }, [ready, signedIn]);

  // Parts 15-22: live company data for walls, desks and events (signed in only).
  useCompanyDataFeed(frameRef, ready, signedIn);

  // Back from OfficeOS: hand the keyboard straight back to the office so WASD keeps working.
  useEffect(() => { if (!inOs) frameRef.current?.focus(); }, [inOs]);

  // Item 25: the office is hidden behind OfficeOS (the desk laptop) — stop its 3D render loop so the laptop UI is smooth.
  useEffect(() => { if (ready) postToOffice(frameRef, 'RENDER', { paused: inOs }); }, [ready, inOs]);

  // Item 37: the Boardroom's news channel (a YouTube embed URL, e.g. https://www.youtube.com/embed/live_stream?channel=<ID>).
  useEffect(() => { if (ready) postToOffice(frameRef, 'CONFIG', { newsUrl: process.env.NEXT_PUBLIC_BOARDROOM_NEWS_URL ?? '' }); }, [ready]);

  // Anything said to the Assistant (stub box below, or the SAAHVIK panel in OfficeOS) makes her tablet react.
  // Part 16 replaces the console log in the office's assistantNote() with real note-taking.
  const tellAssistant = useCallback((text: string) => {
    frameRef.current?.contentWindow?.postMessage({ target: 'aevora-office', type: 'ASSISTANT_NOTE', data: { text } }, window.location.origin);
  }, []);
  useEffect(() => {
    const onMsg = (e: Event) => tellAssistant((e as CustomEvent<string>).detail ?? '');
    window.addEventListener('aevora:assistant-message', onMsg);
    return () => window.removeEventListener('aevora:assistant-message', onMsg);
  }, [tellAssistant]);

  function focusRoom(key: string) {
    frameRef.current?.contentWindow?.postMessage({ target: 'aevora-office', type: 'FOCUS_ZONE', data: { key } }, window.location.origin);
  }

  // Phase 12: Forward movement events from the autonomy stream
  useEffect(() => {
    if (!ready || !signedIn) return;
    let es: EventSource | null = null, closed = false, retry: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      es = await openCompanyStream();
      if (closed) return es?.close();
      if (!es) { retry = setTimeout(connect, 5000); return; }
      es.onerror = () => { es?.close(); if (!closed) retry = setTimeout(connect, 5000); }; // token is 60 s: reconnect with a fresh one
      es.onmessage = onEvent;
    };
    const onEvent = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'AUTONOMOUS_EVENT') {
          const payload = parsed.payload;
          if (payload?.type === 'EMPLOYEE_MOVEMENT_STARTED' || payload?.type === 'EMPLOYEE_ARRIVED') {
            frameRef.current?.contentWindow?.postMessage({ target: 'aevora-office', type: payload.type, data: payload }, window.location.origin);
          }
        }
      } catch (err) {}
    };
    void connect();
    return () => { closed = true; clearTimeout(retry); es?.close(); };
  }, [ready, signedIn]);

  const employees = (data?.employees ?? []).filter((e) => e.status !== 'TERMINATED');
  const { byRoom } = groupByRoom(employees);
  const dept: Department | undefined = room ? DEPT_BY_ZONE.get(room.key) : undefined;
  const people = dept ? byRoom.get(dept.id) ?? [] : [];
  const person = employees.find((e) => e.id === personId) ?? null;

  return (
    <div className="game-shell">
      {/* OFFICE_READY can fire before this component's listener attaches (cached iframe), so also check on load:
          the office removes its #loading element once the scene is built. */}
      <iframe ref={frameRef} src={OFFICE_SRC} title="AEVORA HQ — walkable 3D office" className="game-world" allow="autoplay; microphone"
        onLoad={(e) => { if (!e.currentTarget.contentDocument?.getElementById('loading')) setReady(true); }} />

      {!ready && (
        <div className="game-loading">
          <div className="game-loading-mark">AEVORA</div>
          <div className="game-loading-sub">BUILDING THE 3D OFFICE…</div>
        </div>
      )}

      {!inOs && ready && (
        <>
          <div className="game-hud">
            {here ? <strong>{here}</strong> : null}
            <span>{HINT}</span>
          </div>
          {near && (
            <button type="button" className="game-desk-prompt" onClick={login}>
              Press <kbd>Enter</kbd> to log in
            </button>
          )}
          {talkTo && (
            <form className="game-note" onSubmit={(e) => {
              e.preventDefault(); const text = note.trim();
              const go = text.match(/^(?:take me to|go to)\s+(.+)$/i); // Part 15 item 24
              if (go) postToOffice(frameRef, 'GOTO', { place: go[1] });
              else if (text) {
                postToOffice(frameRef, 'SPEECH', { from: 'You', text: talkTo.kind === 'employee' ? `(to ${talkTo.name}) ${text}` : text }); // your line as a caption + in the log
                // Item 31: employees answer for themselves (in character, their own voice); the Assistant answers as before.
                if (talkTo.kind === 'employee' && talkTo.id) runOfficeAction({ kind: 'employeeChat', id: talkTo.id, name: talkTo.name, text }, { frame: frameRef, push: (h) => router.push(h), signedIn });
                else { tellAssistant(text); runOfficeAction({ kind: 'assistant', text }, { frame: frameRef, push: (h) => router.push(h), signedIn }); }
              }
              setNote(''); setTalkTo(null); frameRef.current?.focus();
            }}>
              <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Talking to ${talkTo.name}… (Enter to send, Esc to cancel)`} aria-label={`Talk to ${talkTo.name}`}
                onKeyDown={(e) => { if (e.key === 'Escape') { setNote(''); setTalkTo(null); frameRef.current?.focus(); } }} />
              {talkTo.kind === 'employee' && talkTo.id && (
                <div className="game-note-actions">
                  <button type="button" className="btn btn-secondary" disabled={listening} onClick={() => askByVoice(talkTo)}>{listening ? 'Listening…' : '🎤 Ask by voice'}</button>
                  <button type="button" className="btn btn-secondary" onClick={async () => {
                    const t = talkTo; setTalkTo(null); if (!t.id) return;
                    postToOffice(frameRef, 'ONE_ON_ONE', { id: t.id }); setOneOnOne({ id: t.id, name: t.name, record: null });
                    const r = signedIn ? await chairmanFetch<Record<string, unknown>>(`/chairman/employees/${t.id}`) : null;
                    setOneOnOne((o) => (o && o.id === t.id ? { ...o, record: r?.data ?? null } : o));
                  }}>1:1 in my office</button>
                  <button type="button" className="btn btn-secondary" onClick={() => { const t = talkTo; setTalkTo(null); if (t.id) postToOffice(frameRef, 'OVER_SHOULDER', { id: t.id }); frameRef.current?.focus(); }}>Look over their shoulder</button>
                </div>
              )}
            </form>
          )}
          <button type="button" className="btn btn-secondary game-talk-toggle" onClick={() => setTalkOpen((o) => !o)} aria-expanded={talkOpen}>
            💬 Conversations{unread ? <span className="game-talk-badge">{unread}</span> : null}
          </button>
          {talkOpen && (
            <aside className="card game-talk" aria-label="Conversations">
              <div className="game-talk-head"><strong>Conversations</strong><button type="button" className="btn btn-secondary" onClick={() => setTalk([])}>Clear</button></div>
              {talk.length === 0 ? <p className="game-talk-empty">Nothing yet. Replies from your team and the Assistant show up here.</p> : (
                <ol className="game-talk-list">
                  {talk.slice().reverse().map((l, i) => (
                    <li key={`${l.at}-${i}`} className={l.mine ? 'mine' : ''}>
                      <div className="game-talk-meta"><span>{l.mine ? 'You' : l.from}</span><time>{new Date(l.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time></div>
                      <div>{l.text}</div>
                      {!l.mine && l.speakerId && (
                        <button type="button" className="btn btn-secondary game-talk-reply" onClick={() => setTalkTo(l.speakerId === 'assistant' ? { kind: 'assistant', name: 'your assistant' } : { kind: 'employee', id: l.speakerId!, name: l.from })}>Reply</button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          )}
          {oneOnOne && (
            <aside className="card game-room" aria-label={`One-on-one with ${oneOnOne.name}`}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>1:1 with {oneOnOne.name}</div>
              {oneOnOne.record ? (
                <>
                  {(['performance', 'reliability', 'experience'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} value={String(oneOnOne.record?.[k] ?? '—')} />)}
                  <Field label="Activity" value={String(oneOnOne.record.activity ?? '—').toLowerCase()} />
                </>
              ) : <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', margin: 'var(--space-2) 0' }}>{signedIn ? 'Loading their record…' : 'Log in to see their record.'}</div>}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 2 }}>Work diary (what the office has seen)</div>
              {(oneOnOne.diary ?? []).length === 0 ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)' }}>Nothing recorded yet</div>
                : (oneOnOne.diary ?? []).map((e, i) => <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)' }}>{new Date(e.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} · {e.text}</div>)}
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }}
                onClick={() => { postToOffice(frameRef, 'END_ONE_ON_ONE', { id: oneOnOne.id }); setOneOnOne(null); frameRef.current?.focus(); }}>End 1:1</button>
            </aside>
          )}
          {seatPrompt && (
            <div className="game-seat-prompt" role="status">
              Press <kbd>E</kbd> to {seatPrompt === 'stand' ? 'stand up' : 'sit'}
            </div>
          )}
        </>
      )}

      {!inOs && room && (
        <aside className="card game-room" aria-label={`${room.name} details`}>
          {person ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{person.name}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 'var(--space-3)' }}>{person.role ?? 'Employee'}</div>
              <Field label="Department" value={person.departmentName ?? '—'} />
              {person.currentTaskTitle && <Field label="Current task" value={person.currentTaskTitle} />}
              <span className={`badge ${person.activity === 'WORKING' ? 'badge-success' : person.activity === 'IN_MEETING' ? 'badge-accent' : 'badge-neutral'}`}>
                {person.activity.toLowerCase().replace('_', ' ')}
              </span>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={() => setPersonId(null)}>Back to {room.name.toLowerCase()}</button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: dept?.color ?? 'var(--text)' }}>{dept?.name ?? titleCase(room.name)}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 'var(--space-3)' }}>{dept?.subtitle ?? 'Shared space'}</div>
              {!signedIn && dept && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Log in at your desk to see live data.</div>}
              {signedIn && dept && liveValues[dept.id] && <Field label="Live" value={liveValues[dept.id]} />}
              {signedIn && dept && (
                <>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 2 }}>Employees</div>
                  {people.length === 0 && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Nobody assigned yet</div>}
                  {people.map((e) => (
                    <button key={e.id} type="button" onClick={() => setPersonId(e.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '3px 0', border: 0, background: 'none', color: 'var(--text-2)', fontSize: 'var(--text-xs)', textAlign: 'left', cursor: 'pointer' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: getEmployeeColor(e.departmentName) }} />
                      {e.name} · {e.role ?? 'Employee'}
                      <span style={{ marginLeft: 'auto', color: e.activity === 'WORKING' ? 'var(--success)' : 'var(--text-3)' }}>{e.activity.toLowerCase().replace('_', ' ')}</span>
                    </button>
                  ))}
                </>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => focusRoom(room.key)}>Fly here</button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRoom(null)}>Dismiss</button>
              </div>
            </>
          )}
        </aside>
      )}

      {inOs && <OfficeOS>{children}</OfficeOS>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', marginBottom: 'var(--space-3)' }}>{value}</div>
    </>
  );
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
