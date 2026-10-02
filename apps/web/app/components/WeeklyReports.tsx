'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { formatINRWhole } from './ui';

export interface WeeklyReport {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  leadsFoundCount: number;
  leadsContactedCount: number;
  dealsWonCount: number;
  revenueEarnedPaise: number;
  topPerformingCategory: string | null;
  biggestChallenge: string;
  ceoCommentary: string;
  sentAt: string | null;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function ReportBody({ r }: { r: WeeklyReport }) {
  return (
    <>
      <div className="metrics-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <div className="card"><div className="card-label">Leads found</div><div className="card-value">{r.leadsFoundCount}</div></div>
        <div className="card"><div className="card-label">Contacted</div><div className="card-value">{r.leadsContactedCount}</div></div>
        <div className="card"><div className="card-label">Deals won</div><div className="card-value">{r.dealsWonCount}</div></div>
        <div className="card"><div className="card-label">Revenue</div><div className="card-value money">{formatINRWhole(r.revenueEarnedPaise)}</div></div>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Biggest challenge:</strong> {r.biggestChallenge}
        {r.topPerformingCategory && <> · <strong style={{ color: 'var(--text-primary)' }}>Best category:</strong> {r.topPerformingCategory}</>}
      </p>
      {r.ceoCommentary.split(/\n\s*\n/).map((para, i) => (
        <p key={i} style={{ lineHeight: 1.65, marginBottom: 10 }}>{para}</p>
      ))}
    </>
  );
}

/** Last 4 weekly CEO reports; the newest is open. */
export default function WeeklyReports() {
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await chairmanFetch<WeeklyReport[]>('/ceo/weekly-reports');
    setReports(r.data ?? []);
    setError(r.error);
  };
  useEffect(() => {
    load();
    const onNew = () => load();
    window.addEventListener('aevora:ceo.weekly_report', onNew);
    return () => window.removeEventListener('aevora:ceo.weekly_report', onNew);
  }, []);

  const generate = async () => {
    setBusy(true);
    const r = await chairmanFetch('/ceo/weekly-reports/run', { method: 'POST' });
    if (r.error) setError(r.error);
    await load();
    setBusy(false);
  };

  if (!reports) return <div className="state-loading">Loading reports…</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>CEO weekly reports</h2>
        <button className="btn" onClick={generate} disabled={busy}>{busy ? 'Writing…' : "Generate last week's report"}</button>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {reports.length === 0 && <div className="state-empty">No reports yet. The CEO writes one every Monday at 9am (simulation time).</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map((r, i) => (
          <details key={r.id} open={i === 0} className="card" style={{ padding: 0 }}>
            <summary style={{ cursor: 'pointer', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', gap: 12, listStyle: 'none' }}>
              <strong>Week of {fmtDate(r.weekStartDate)} – {fmtDate(r.weekEndDate)}</strong>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {r.dealsWonCount} won · {formatINRWhole(r.revenueEarnedPaise)}
              </span>
            </summary>
            <div style={{ padding: '0 18px 16px' }}>
              <ReportBody r={r} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
