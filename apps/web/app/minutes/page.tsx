'use client';

// Part 16 item 27: meeting minutes. The office writes these after meetings (e.g. the Monday meeting); stored in this
// browser (aevora_minutes).

import { useEffect, useState } from 'react';

interface Minutes { id: string; title: string; at: string; points: string[] }

export default function MinutesPage() {
  const [all, setAll] = useState<Minutes[]>([]);
  useEffect(() => { try { setAll(JSON.parse(localStorage.getItem('aevora_minutes') || '[]')); } catch { setAll([]); } }, []);
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meeting minutes</h1>
        <p className="page-desc">Written by your assistant after each meeting in the office.</p>
      </div>
      {all.length === 0 ? (
        <div className="empty-state"><div className="empty-state-title">No meetings yet</div><div className="empty-state-desc">The Monday meeting writes the first set.</div></div>
      ) : all.map((m) => (
        <section key={m.id} className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-2)' }}>{m.title}</h3>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 'var(--space-3)' }}>{new Date(m.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          <ul style={{ paddingLeft: '1.2em', display: 'grid', gap: 4 }}>{m.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      ))}
    </>
  );
}
