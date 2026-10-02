'use client';

import { useEffect, useState } from 'react';
import OutreachPanel from '../components/OutreachPanel';

import { API_BASE } from '../lib/api';

async function apiFetch(path: string) {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('aevora_jwt') : null;
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, data: null };
    return { data: await res.json(), error: null };
  } catch (e: any) {
    return { error: e.message, data: null };
  }
}

const STAGE_COLORS: Record<string, string> = {
  PROSPECTING: 'var(--text-3)', QUALIFICATION: 'var(--info)', DISCOVERY: 'var(--accent)',
  PROPOSAL: 'var(--warning)', NEGOTIATION: 'var(--warning)', WON: 'var(--success)',
  LOST: 'var(--danger)', DISQUALIFIED: 'var(--text-3)',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: 'var(--text-3)', CONTACTED: 'var(--info)', ENGAGED: 'var(--accent)',
  QUALIFIED: 'var(--success)', UNQUALIFIED: 'var(--danger)', CONVERTED: 'var(--info)', ARCHIVED: 'var(--text-3)',
};

type Tab = 'overview' | 'outreach' | 'leads' | 'accounts' | 'opportunities' | 'pipeline';

export default function SalesPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [pipeline, setPipeline] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [stale, setStale] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/sales/pipeline'),
      apiFetch('/sales/leads'),
      apiFetch('/sales/accounts'),
      apiFetch('/sales/opportunities'),
      apiFetch('/sales/pipeline/recommendations'),
      apiFetch('/sales/pipeline/stale'),
    ]).then(([pl, ld, ac, op, rec, sl]) => {
      if (!pl.error) setPipeline(pl.data);
      if (!ld.error) setLeads(ld.data || []);
      if (!ac.error) setAccounts(ac.data || []);
      if (!op.error) setOpportunities(op.data || []);
      if (!rec.error) setRecommendations(rec.data);
      if (!sl.error) setStale(sl.data || []);
      const allErrors = [pl, ld, ac, op].filter(r => r.error);
      if (allErrors.length === 4) setError('Authentication required — please log in');
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading sales data…</div>;

  const activeOpps = opportunities.filter(o => !['WON','LOST','DISQUALIFIED'].includes(o.salesStage));
  const wonOpps = opportunities.filter(o => o.salesStage === 'WON');

  return (
    <>
      <div className="page-header">
        <h2>Sales & Business Development</h2>
        <p>Autonomous sales intelligence &amp; pipeline management</p>
      </div>

      {error && <div className="state-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {(['overview','outreach','leads','accounts','opportunities','pipeline'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'outreach' && <OutreachPanel />}

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
            <div className="metric-card">
              <div className="metric-value">{leads.length}</div>
              <div className="metric-label">Total Leads</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{activeOpps.length}</div>
              <div className="metric-label">Active Opportunities</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{wonOpps.length}</div>
              <div className="metric-label">Won</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">
                {pipeline ? `₹${(pipeline.weightedPipelineValue / 100).toLocaleString()}` : '—'}
              </div>
              <div className="metric-label">Weighted Pipeline</div>
            </div>
          </div>

          {pipeline?.forecastDisclaimer && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong>Forecast Disclaimer:</strong> {pipeline.forecastDisclaimer}
            </div>
          )}

          {recommendations && (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12 }}>AI Recommendations <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>(Advisory Only)</span></h3>
              {recommendations.disclaimer && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{recommendations.disclaimer}</p>
              )}
              {recommendations.recommendations?.length > 0 ? (
                <ul style={{ paddingLeft: 20 }}>
                  {recommendations.recommendations.map((r: string, i: number) => (
                    <li key={i} style={{ marginBottom: 8 }}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>No recommendations at this time.</p>
              )}
            </section>
          )}

          {stale.length > 0 && (
            <section>
              <h3 style={{ marginBottom: 12, color: 'var(--warning)' }}>Stale Opportunities ({stale.length})</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>Opportunity</th><th>Client</th><th>Stage</th><th>Owner</th></tr></thead>
                  <tbody>
                    {stale.map((o: any) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 500 }}>{o.title}</td>
                        <td>{o.client?.name ?? '—'}</td>
                        <td><span style={{ background: STAGE_COLORS[o.salesStage] ?? 'var(--text-3)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius)', fontSize: 12 }}>{o.salesStage}</span></td>
                        <td>{o.owner?.name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <section>
          <h3 style={{ marginBottom: 12 }}>Sales Leads ({leads.length})</h3>
          {leads.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No leads found.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Organization</th><th>Source</th><th>Status</th><th>Owner</th></tr>
                </thead>
                <tbody>
                  {leads.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.contactName}</td>
                      <td>{l.organization ?? '—'}</td>
                      <td>{l.source}</td>
                      <td>
                        <span style={{ background: LEAD_STATUS_COLORS[l.status] ?? 'var(--text-3)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius)', fontSize: 12 }}>
                          {l.status}
                        </span>
                      </td>
                      <td>{l.assignedTo?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ACCOUNTS TAB */}
      {tab === 'accounts' && (
        <section>
          <h3 style={{ marginBottom: 12 }}>Target Accounts ({accounts.length})</h3>
          {accounts.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No target accounts found.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Organization</th><th>Industry</th><th>Size</th><th>Geography</th><th>ICP Fit</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {accounts.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.organizationName}</td>
                      <td>{a.industry ?? '—'}</td>
                      <td>{a.companySize ?? '—'}</td>
                      <td>{a.geography ?? '—'}</td>
                      <td>
                        {a.icpFitScore != null ? (
                          <span style={{ color: a.icpFitScore >= 70 ? 'var(--success)' : a.icpFitScore >= 40 ? 'var(--warning)' : 'var(--danger)', fontWeight: 700 }}>
                            {a.icpFitScore}/100
                          </span>
                        ) : '—'}
                      </td>
                      <td>{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* OPPORTUNITIES TAB */}
      {tab === 'opportunities' && (
        <section>
          <h3 style={{ marginBottom: 12 }}>Opportunities ({opportunities.length})</h3>
          {opportunities.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No opportunities found.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Title</th><th>Client</th><th>Stage</th><th>Value</th><th>Probability</th><th>Owner</th></tr>
                </thead>
                <tbody>
                  {opportunities.map((o: any) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.title}</td>
                      <td>{o.client?.name ?? '—'}</td>
                      <td>
                        <span style={{ background: STAGE_COLORS[o.salesStage] ?? 'var(--text-3)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius)', fontSize: 12 }}>
                          {o.salesStage}
                        </span>
                      </td>
                      <td>{o.estimatedValue ? `₹${(o.estimatedValue / 100).toLocaleString()}` : '—'}</td>
                      <td>{o.probability != null ? `${o.probability}%` : '—'}</td>
                      <td>{o.owner?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* PIPELINE TAB */}
      {tab === 'pipeline' && pipeline && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="metric-card">
              <div className="metric-value">{pipeline.totalOpportunities}</div>
              <div className="metric-label">Total Opportunities</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">`₹${(pipeline.totalEstimatedValue / 100).toLocaleString()}`</div>
              <div className="metric-label">Total Est. Value</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{pipeline.averageConfidence}%</div>
              <div className="metric-label">Avg Confidence</div>
            </div>
          </div>

          <section style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12 }}>Pipeline by Stage</h3>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Stage</th><th>Count</th></tr></thead>
                <tbody>
                  {Object.entries(pipeline.byStage ?? {}).map(([stage, count]: [string, any]) => (
                    <tr key={stage}>
                      <td>
                        <span style={{ background: STAGE_COLORS[stage] ?? 'var(--text-3)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius)', fontSize: 12 }}>
                          {stage}
                        </span>
                      </td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
            {pipeline.forecastDisclaimer}
          </div>
        </>
      )}
    </>
  );
}
