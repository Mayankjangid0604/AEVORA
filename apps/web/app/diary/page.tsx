'use client';

// Part 15 item 62: voice diary. Records with the browser microphone (MediaRecorder) and keeps entries in this
// browser's IndexedDB. Nothing is uploaded.

import { useEffect, useRef, useState } from 'react';

interface Entry { id: string; at: string; seconds: number; blob: Blob }
const DB = 'aevora_diary', STORE = 'entries';

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const q = fn(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null), started = useRef(0);

  const refresh = async () => setEntries(((await tx('readonly', (s) => s.getAll())) as Entry[]).sort((a, b) => b.at.localeCompare(a.at)));
  useEffect(() => { refresh().catch(() => setError('This browser can’t store diary entries.')); }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks: Blob[] = [];
      const r = new MediaRecorder(stream); rec.current = r; started.current = Date.now();
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const entry: Entry = { id: crypto.randomUUID(), at: new Date().toISOString(), seconds: Math.round((Date.now() - started.current) / 1000), blob: new Blob(chunks, { type: r.mimeType }) };
        await tx('readwrite', (s) => s.put(entry)); refresh();
      };
      r.start(); setRecording(true);
    } catch { setError('Microphone permission was refused or no microphone is available.'); }
  }
  function stop() { rec.current?.stop(); setRecording(false); }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Voice diary</h1>
        <p className="page-desc">Talk through your day. Recordings stay in this browser only.</p>
      </div>
      <div className="card" style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        {recording
          ? <button className="btn btn-primary" type="button" onClick={stop}>■ Stop recording</button>
          : <button className="btn btn-primary" type="button" onClick={start}>● Record</button>}
        {recording && <span className="badge badge-danger">Recording…</span>}
        {error && <span className="state-error" role="alert">{error}</span>}
      </div>
      {entries.length === 0 ? <div className="empty-state"><div className="empty-state-title">No entries yet</div></div> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
          {entries.map((e) => <DiaryRow key={e.id} entry={e} onDelete={async () => { await tx('readwrite', (s) => s.delete(e.id)); refresh(); }} />)}
        </ul>
      )}
    </>
  );
}

function DiaryRow({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const u = URL.createObjectURL(entry.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [entry.blob]);
  return (
    <li className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 180 }}>{new Date(entry.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {entry.seconds}s</span>
      {url && <audio controls src={url} style={{ flex: 1, minWidth: 220 }} />}
      <button className="btn btn-secondary" type="button" onClick={onDelete}>Delete</button>
    </li>
  );
}
