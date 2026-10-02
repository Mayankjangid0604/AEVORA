'use client';

// Part 15 item 64: sticky-note tasks. Stored in this browser (aevora_sticky); open notes also appear stuck around the
// Chairman's monitor in the 3D office (it listens for storage changes).

import { useEffect, useState } from 'react';

interface Sticky { id: string; text: string; done: boolean; at: string }
const KEY = 'aevora_sticky';
const read = (): Sticky[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

export default function NotesPage() {
  const [notes, setNotes] = useState<Sticky[]>([]);
  const [text, setText] = useState('');
  useEffect(() => setNotes(read()), []);
  const save = (next: Sticky[]) => { setNotes(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full/blocked */ } };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Sticky notes</h1>
        <p className="page-desc">Quick to-dos for yourself. The first six open notes are stuck around your monitor in the office.</p>
      </div>
      <form className="card" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
        onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; save([{ id: crypto.randomUUID(), text: t.slice(0, 140), done: false, at: new Date().toISOString() }, ...notes]); setText(''); }}>
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Call the Jaipur client at 4…" aria-label="New sticky note" maxLength={140} />
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      {notes.length === 0 ? <div className="empty-state"><div className="empty-state-title">No notes yet</div></div> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
          {notes.map((n) => (
            <li key={n.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', opacity: n.done ? 0.55 : 1 }}>
              <input type="checkbox" checked={n.done} aria-label={`Done: ${n.text}`} onChange={() => save(notes.map((x) => (x.id === n.id ? { ...x, done: !x.done } : x)))} />
              <span style={{ flex: 1, textDecoration: n.done ? 'line-through' : 'none' }}>{n.text}</span>
              <button className="btn btn-secondary" type="button" onClick={() => save(notes.filter((x) => x.id !== n.id))}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
