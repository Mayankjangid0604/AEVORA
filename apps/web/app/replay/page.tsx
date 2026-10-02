'use client';

// Part 22 item 97: monthly time-lapse. The office saves one snapshot per IST day (aevora_daily, this browser);
// Replay plays the last 30 recorded days back like a sped-up film. Real recorded days only — nothing is back-filled.

import { useEffect, useRef, useState } from 'react';

interface Day { date: string; xp: number; level: number; balancePaise: number | null; employees: number; leads: number; clients: number; paidProjects: number; revenuePaise: number }
const METRICS: [keyof Day, string, (v: number) => string][] = [
  ['revenuePaise', 'Revenue', (v) => '₹' + Math.round(v / 100).toLocaleString('en-IN')],
  ['xp', 'Company XP', (v) => v.toLocaleString('en-IN')],
  ['leads', 'Leads', String], ['clients', 'Clients', String], ['employees', 'Team', String],
];

export default function ReplayPage() {
  const [days, setDays] = useState<Day[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => { try { const d: Day[] = JSON.parse(localStorage.getItem('aevora_daily') || '[]').slice(-30); setDays(d); setI(Math.max(0, d.length - 1)); } catch { setDays([]); } }, []);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setI((n) => { if (n + 1 >= days.length) { setPlaying(false); return n; } return n + 1; }), 700);
    return () => clearInterval(timer.current);
  }, [playing, days.length]);

  const cur = days[i];
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Replay</h1>
        <p className="page-desc">Monthly time-lapse: how AEVORA changed day by day (recorded while you use the office).</p>
      </div>
      {days.length < 2 ? (
        <div className="empty-state">
          <div className="empty-state-title">{days.length === 0 ? 'No days recorded yet' : 'Only one day recorded so far'}</div>
          <div className="empty-state-desc">The office saves a snapshot each day you’re signed in. Come back after a few days for the time-lapse.</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <button className="btn btn-primary" type="button" onClick={() => { if (i >= days.length - 1) setI(0); setPlaying((p) => !p); }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <input type="range" min={0} max={days.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(+e.target.value); }} style={{ flex: 1 }} aria-label="Day" />
            <strong style={{ minWidth: 110, textAlign: 'right' }}>{cur?.date}</strong>
          </div>
          <div className="metrics-grid">
            {METRICS.map(([k, label, fmt]) => {
              const max = Math.max(1, ...days.map((d) => Number(d[k] ?? 0))), v = Number(cur?.[k] ?? 0);
              return (
                <div key={k} className="stat-card">
                  <div className="stat-label">{label}</div>
                  <div className="stat-value">{fmt(v)}</div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 8 }}><div style={{ height: 6, width: `${(v / max) * 100}%`, background: 'var(--accent, #7c6cff)', borderRadius: 3, transition: 'width .5s' }} /></div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
