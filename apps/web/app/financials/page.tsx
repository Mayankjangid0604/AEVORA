'use client';

import { useEffect, useState } from 'react';
import { api, chairmanFetch } from '../lib/api';
import { formatINRWhole, formatAC } from '../components/ui';

export default function FinancialsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashPos, setCashPos] = useState<any>(null);
  const [runway, setRunway] = useState<any>(null);
  const [ageing, setAgeing] = useState<any>(null);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [cfoRecs, setCfoRecs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'cfo'>('overview');

  useEffect(() => {
    api.financials().then(res => {
      if (res.error) setError(res.error);
      else setData(res.data);
      setLoading(false);
    });
    // Phase 28 CFO analytics (best-effort — may fail if no data yet)
    Promise.allSettled([
      chairmanFetch('/finance/analytics/cash-position').then(r => r.data),
      chairmanFetch('/finance/analytics/runway').then(r => r.data),
      chairmanFetch('/finance/analytics/payables-ageing').then(r => r.data),
      chairmanFetch('/finance/forecasts').then(r => r.data),
      chairmanFetch('/finance/cfo/recommendations').then(r => r.data),
    ]).then(([cp, rw, ag, fc, recs]) => {
      if (cp.status === 'fulfilled' && cp.value) setCashPos(cp.value);
      if (rw.status === 'fulfilled' && rw.value) setRunway(rw.value);
      if (ag.status === 'fulfilled' && ag.value) setAgeing(ag.value);
      if (fc.status === 'fulfilled' && Array.isArray(fc.value)) setForecasts(fc.value);
      if (recs.status === 'fulfilled' && Array.isArray(recs.value)) setCfoRecs(recs.value);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading financials…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;
  if (!data) return <div className="state-empty">No financial data</div>;

  const r = data.report;

  return (
    <>
      <div className="page-header">
        <h2>Financial Dashboard</h2>
        <p>Company financial overview — real-time from PostgreSQL</p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        {(['overview', 'ledger', 'cfo'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: activeTab === tab ? 'var(--accent)' : 'transparent',
              color: activeTab === tab ? 'var(--bg)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)',
              fontWeight: activeTab === tab ? 700 : 400, textTransform: 'capitalize',
            }}
          >
            {tab === 'overview' ? 'Overview' : tab === 'ledger' ? 'Journal Ledger' : 'AI CFO'}
          </button>
        ))}
      </div>
      {activeTab === 'cfo' && (
        <div style={{ padding: 'var(--space-3)', background: 'rgba(255,200,0,0.08)', border: '2px solid var(--warning)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)' }}>
          <strong>⚠ AI CFO ADVISORY DISCLAIMER</strong>
          <p style={{ margin: 0, fontSize: '0.8rem', marginTop: 'var(--space-1)' }}>
            All AI CFO outputs are <strong>ADVISORY ONLY</strong>. They are AI-generated estimates and do NOT constitute authoritative financial data.
            No financial action has been taken. Human review and explicit authorization are required before any action.
          </p>
        </div>
      )}

      {activeTab === 'overview' && (
      <div className="metrics-grid">
        <div className="card">
          <div className="card-label">💰 Real Money Treasury <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'4px'}}>ACTUAL</span></div>
          <div className="card-value money">{data.realMoneyBalance !== null ? formatINRWhole(data.realMoneyBalance) : 'Unavailable'}</div>
        </div>
        <div className="card">
          <div className="card-label">🟣 AC Treasury <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'4px'}}>ACTUAL</span></div>
          <div className="card-value ac">{data.acBalance !== null ? formatAC(data.acBalance) : 'Unavailable'}</div>
        </div>
      </div>
      )}

      {activeTab === 'overview' && r && (
        <>
          <div className="fin-section">
            <h3>💵 Cash Flow (Real Money)</h3>
            <div className="fin-row"><span className="fin-label">Opening Balance (Chairman Funding)</span><span className="fin-value positive">{formatINRWhole(r.openingBalance)}</span></div>
            <div className="fin-row"><span className="fin-label">+ Realized Revenue</span><span className="fin-value positive">{formatINRWhole(r.realizedRevenue)}</span></div>
            <div className="fin-row"><span className="fin-label">− Paid Expenses</span><span className="fin-value negative">{formatINRWhole(r.paidExpenses)}</span></div>
            <div className="fin-row" style={{fontWeight: 700}}><span className="fin-label">= Cash Position</span><span className={`fin-value ${r.cashPosition >= 0 ? 'positive' : 'negative'}`}>{formatINRWhole(r.cashPosition)}</span></div>
          </div>

          <div className="fin-section">
            <h3>📊 Profit & Loss (Analytical)</h3>
            <div className="fin-row"><span className="fin-label">Realized Revenue</span><span className="fin-value positive">{formatINRWhole(r.realizedRevenue)}</span></div>
            <div className="fin-row"><span className="fin-label">− Paid Expenses (Real Money)</span><span className="fin-value negative">{formatINRWhole(r.paidExpenses)}</span></div>
            <div className="fin-row"><span className="fin-label">− Payroll (AC converted)</span><span className="fin-value negative">{formatINRWhole(r.payrollCostINR)}</span></div>
            <div className="fin-row" style={{fontWeight: 700}}><span className="fin-label">= Operating Result</span><span className={`fin-value ${r.operatingResult >= 0 ? 'positive' : 'negative'}`}>{formatINRWhole(r.operatingResult)}</span></div>
            <p style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 'var(--space-2)'}}>
              Note: AC payroll is an internal compensation expense shown analytically. It does NOT reduce real-money cash flow.
            </p>
          </div>

          <div className="fin-section">
            <h3>⏳ Runway</h3>
            <div className="fin-row"><span className="fin-label">Runway</span><span className="fin-value">{r.runway}</span></div>
          </div>

          <div className="fin-section">
            <h3>🟣 AC Payroll Summary</h3>
            <div className="fin-row"><span className="fin-label">Total AC Paid</span><span className="fin-value ac">{formatAC(r.payrollCostAC)}</span></div>
            <div className="fin-row"><span className="fin-label">INR Equivalent (reference only)</span><span className="fin-value">{formatINRWhole(r.payrollCostINR)}</span></div>
          </div>
        </>
      )}

      {activeTab === 'overview' && data.revenueRecords && data.revenueRecords.length > 0 && (
        <div className="section">
          <h3 className="section-title">Revenue Records <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px'}}>ACTUAL</span></h3>
          <table className="data-table">
            <thead><tr><th>Source</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {data.revenueRecords.map((rec: any) => (
                <tr key={rec.id}>
                  <td>{rec.source}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{formatINRWhole(rec.amount)}</td>
                  <td><span className={`badge badge-${rec.status.toLowerCase()}`}>{rec.status}</span></td>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>{new Date(rec.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'overview' && data.expenses && data.expenses.length > 0 && (
        <div className="section">
          <h3 className="section-title">Expenses <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px'}}>ACTUAL</span></h3>
          <table className="data-table">
            <thead><tr><th>Category</th><th>Amount</th><th>Status</th><th>Description</th></tr></thead>
            <tbody>
              {data.expenses.map((exp: any) => (
                <tr key={exp.id}>
                  <td>{exp.category}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{formatINRWhole(exp.amount)}</td>
                  <td><span className={`badge badge-${exp.status.toLowerCase()}`}>{exp.status}</span></td>
                  <td style={{color: 'var(--text-secondary)'}}>{exp.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* LEDGER TAB */}
      {activeTab === 'ledger' && (
        <div className="section">
          <h3 className="section-title">Journal Ledger <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px'}}>ACTUAL — Double-Entry</span></h3>
          <p style={{color:'var(--text-muted)',fontSize:'0.8rem'}}>
            All posted journal entries are immutable. Corrections are made via reversal entries only.
            Use the Finance API to view full entries: <code>GET /api/finance/journal</code>
          </p>
          <div className="card" style={{marginTop:'var(--space-3)'}}>
            <div className="card-label">Chart of Accounts</div>
            <p style={{color:'var(--text-muted)',fontSize:'0.8rem',margin:0}}>
              Manage accounts at <code>GET /api/finance/accounts</code> | Periods at <code>GET /api/finance/periods</code>
            </p>
          </div>
        </div>
      )}

      {/* AI CFO TAB */}
      {activeTab === 'cfo' && (
        <>
          <div className="metrics-grid">
            <div className="card">
              <div className="card-label">💰 Cash Position <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'4px'}}>ACTUAL</span></div>
              <div className="card-value">{cashPos ? formatINRWhole(cashPos.balancePaise) : '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">🔥 Monthly Burn Rate <span style={{fontSize:'0.65rem',background:'var(--warning)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'4px'}}>ADVISORY</span></div>
              <div className="card-value">{runway ? formatINRWhole(runway.monthlyBurnRatePaise) + '/mo' : '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">⏱ Estimated Runway <span style={{fontSize:'0.65rem',background:'var(--warning)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'4px'}}>ADVISORY</span></div>
              <div className="card-value">{runway?.estimatedRunwayMonths != null ? `${runway.estimatedRunwayMonths} months` : '—'}</div>
              {runway && <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:'var(--space-1)'}}>{runway.disclaimer}</div>}
            </div>
          </div>

          {ageing && (
            <div className="fin-section">
              <h3>📋 Payables Ageing <span style={{fontSize:'0.65rem',background:'var(--success)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px'}}>ACTUAL</span></h3>
              <div className="fin-row"><span className="fin-label">Current (not overdue)</span><span className="fin-value">{formatINRWhole(ageing.current)}</span></div>
              <div className="fin-row"><span className="fin-label">1-30 days overdue</span><span className={`fin-value ${ageing.overdue30 > 0 ? 'negative' : ''}`}>{formatINRWhole(ageing.overdue30)}</span></div>
              <div className="fin-row"><span className="fin-label">31-60 days overdue</span><span className={`fin-value ${ageing.overdue60 > 0 ? 'negative' : ''}`}>{formatINRWhole(ageing.overdue60)}</span></div>
              <div className="fin-row"><span className="fin-label">90+ days overdue</span><span className={`fin-value ${ageing.overdue90plus > 0 ? 'negative' : ''}`}>{formatINRWhole(ageing.overdue90plus)}</span></div>
            </div>
          )}

          {forecasts.length > 0 && (
            <div className="section">
              <h3 className="section-title">
                Financial Forecasts
                <span style={{fontSize:'0.65rem',background:'var(--warning)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'8px'}}>ADVISORY — NOT ACTUAL</span>
              </h3>
              <p style={{fontSize:'0.75rem',color:'var(--error)',marginTop:0}}>
                ⚠ These are AI-generated forecasts. They are NOT authoritative financial records. Do not use for accounting purposes.
              </p>
              <table className="data-table">
                <thead><tr><th>Type</th><th>Period</th><th>Amount (Advisory)</th><th>Confidence</th><th>Source</th></tr></thead>
                <tbody>
                  {forecasts.map((f: any) => (
                    <tr key={f.id}>
                      <td>{f.forecastType}</td>
                      <td>{f.period}</td>
                      <td style={{fontFamily:'var(--font-mono)',color:'var(--warning)'}}>{formatINRWhole(f.amount)} ⚠ FORECAST</td>
                      <td>{f.confidence != null ? `${(f.confidence * 100).toFixed(0)}%` : '—'}</td>
                      <td style={{color:'var(--text-muted)',fontSize:'0.75rem'}}>{f.dataSource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cfoRecs.length > 0 && (
            <div className="section">
              <h3 className="section-title">
                AI CFO Recommendations
                <span style={{fontSize:'0.65rem',background:'var(--warning)',color:'var(--bg)',padding:'1px 4px',borderRadius:'3px',marginLeft:'8px'}}>ADVISORY ONLY — NO ACTION TAKEN</span>
              </h3>
              {cfoRecs.map((rec: any) => (
                <div key={rec.id} className="card" style={{marginBottom:'var(--space-3)',borderLeft:'3px solid var(--warning)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <strong>{rec.title}</strong>
                    <span style={{fontSize:'0.65rem',background:'var(--warning)',color:'var(--bg)',padding:'2px 6px',borderRadius:'3px'}}>{rec.category}</span>
                  </div>
                  <p style={{margin:'var(--space-2) 0',color:'var(--text-secondary)',fontSize:'0.85rem'}}>{rec.body}</p>
                  <div style={{fontSize:'0.65rem',color:'var(--error)',borderTop:'1px solid var(--border)',paddingTop:'var(--space-1)'}}>
                    {rec.disclaimer}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
