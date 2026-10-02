'use client';

import { useEffect, useState } from 'react';
import { chairmanFetch } from '../lib/api';
import { formatINR, timeAgo } from '../components/ui';

const STATUS_COLOR: Record<string, string> = {
  HEALTHY: 'var(--status-healthy)',
  WARNING: 'var(--status-caution)',
  CRITICAL: 'var(--status-critical)',
  SHUTDOWN: 'var(--status-critical)',
};

export default function SurvivalPage() {
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await chairmanFetch('/survival/status');
    setS(r.data);
    setError(r.error);
  }
  useEffect(() => { load(); }, []);

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) return setError('Enter a positive rupee amount');
    setBusy(true);
    const r = await chairmanFetch('/survival/deposit', {
      method: 'POST',
      body: { amountPaise: paise, idempotencyKey: crypto.randomUUID(), description: note || undefined },
    });
    if (r.error) setError(r.error);
    else { setAmount(''); setNote(''); }
    await load();
    setBusy(false);
  }

  if (!s && !error) return <div className="state-loading">Loading survival status…</div>;

  const min = s?.config?.minBalancePaise ?? 0;
  const warn = s?.config?.warningBalancePaise ?? 1;
  const scaleMax = Math.max(warn * 2, s?.balancePaise ?? 0);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const color = STATUS_COLOR[s?.status] ?? 'var(--status-neutral)';

  return (
    <>
      <div className="page-header">
        <h2>Survival</h2>
        <p>No money, no company. Balance below the minimum shuts every agent down.</p>
      </div>
      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      {s && (
        <>
          <div className="metrics-grid">
            <div className="card">
              <div className="card-label">Status</div>
              <div className="card-value" style={{ color }}>{s.status}</div>
            </div>
            <div className="card">
              <div className="card-label">Real balance</div>
              <div className="card-value">{formatINR(s.balancePaise)}</div>
            </div>
            <div className="card">
              <div className="card-label">Shutdown below</div>
              <div className="card-value">{formatINR(min)}</div>
            </div>
            <div className="card">
              <div className="card-label">Warning below</div>
              <div className="card-value">{formatINR(warn)}</div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Balance gauge</div>
            <div
              role="meter"
              aria-valuemin={0}
              aria-valuemax={scaleMax}
              aria-valuenow={s.balancePaise}
              aria-label="Real money balance"
              style={{ position: 'relative', height: 22, background: 'var(--bg-input)', borderRadius: 'var(--radius)', overflow: 'hidden' }}
            >
              <div style={{ width: pct(s.balancePaise), height: '100%', background: color }} />
              <div title="Shutdown threshold" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(min), width: 2, background: 'var(--status-critical)' }} />
              <div title="Warning threshold" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(warn), width: 2, background: 'var(--status-caution)' }} />
            </div>
          </div>
        </>
      )}

      <div className="section">
        <div className="section-title">Log a real deposit</div>
        <form onSubmit={deposit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label>
            Amount (₹){' '}
            <input type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 140 }} />
          </label>
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '1 1 200px' }} />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Deposit'}</button>
        </form>
      </div>

      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="section">
            <div className="section-title">Deposit log</div>
            {s.deposits.length === 0 ? <div className="state-empty">No deposits yet</div> : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Amount</th><th>Note</th></tr></thead>
                <tbody>{s.deposits.map((d: any) => (
                  <tr key={d.id}><td>{timeAgo(d.createdAt)}</td><td>{formatINR(d.amount)}</td><td>{d.description}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="section">
            <div className="section-title">Status history</div>
            {s.events.length === 0 ? <div className="state-empty">No events yet</div> : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Event</th><th>Balance / amount</th></tr></thead>
                <tbody>{s.events.map((e: any) => (
                  <tr key={e.id}><td>{timeAgo(e.createdAt)}</td><td>{e.event}</td><td>{formatINR(e.balancePaise)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
