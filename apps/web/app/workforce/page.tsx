'use client';

import { useEffect, useState } from 'react';

type Tab = 'organization' | 'workforce' | 'talent' | 'management' | 'ai';

export default function WorkforcePage() {
  const [activeTab, setActiveTab] = useState<Tab>('workforce');
  const [analytics, setAnalytics] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [aiWorkers, setAiWorkers] = useState<any[]>([]);
  const [hiringRequests, setHiringRequests] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/workforce/analytics/workforce').then(r => r.ok ? r.json() : null),
      fetch('/api/workforce/profiles').then(r => r.ok ? r.json() : null),
      fetch('/api/workforce/ai/workers').then(r => r.ok ? r.json() : null),
      fetch('/api/workforce/hiring').then(r => r.ok ? r.json() : null),
      fetch('/api/workforce/plans').then(r => r.ok ? r.json() : null),
    ]).then(([an, pr, ai, hr, pl]) => {
      if (an.status === 'fulfilled' && an.value) setAnalytics(an.value);
      if (pr.status === 'fulfilled' && Array.isArray(pr.value)) setProfiles(pr.value);
      if (ai.status === 'fulfilled' && Array.isArray(ai.value)) setAiWorkers(ai.value);
      if (hr.status === 'fulfilled' && Array.isArray(hr.value)) setHiringRequests(hr.value);
      if (pl.status === 'fulfilled' && Array.isArray(pl.value)) setPlans(pl.value);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading workforce…</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'organization', label: 'Organization' },
    { id: 'workforce', label: 'Workforce' },
    { id: 'talent', label: 'Talent' },
    { id: 'management', label: 'Management' },
    { id: 'ai', label: 'AI Workforce' },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Workforce Dashboard</h2>
        <p>Human & AI workforce management — Phase 29</p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: 'var(--space-2) var(--space-3)',
            background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
            color: activeTab === tab.id ? 'var(--bg)' : 'var(--text-secondary)',
            border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)',
            fontWeight: activeTab === tab.id ? 700 : 400,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* WORKFORCE TAB */}
      {activeTab === 'workforce' && (
        <>
          <div className="metrics-grid">
            <div className="card">
              <div className="card-label">👥 Active Employees <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>ACTUAL</span></div>
              <div className="card-value">{analytics?.headcount?.active ?? '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">🤖 AI Workers <span style={{ fontSize: '0.65rem', background: 'var(--accent)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>AI</span></div>
              <div className="card-value">{analytics?.aiHumanRatio?.ai ?? '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">🧑 Human Workers <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>HUMAN</span></div>
              <div className="card-value">{analytics?.aiHumanRatio?.human ?? '—'}</div>
            </div>
            <div className="card">
              <div className="card-label">💰 Workforce Cost (AC) <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>ACTUAL</span></div>
              <div className="card-value">{analytics?.totalWorkforceCostAC ?? '—'} AC</div>
            </div>
          </div>
          <div className="metrics-grid">
            <div className="card">
              <div className="card-label">📊 Avg Performance</div>
              <div className="card-value">{analytics?.averagePerformance?.toFixed(1) ?? '—'} / 100</div>
            </div>
            <div className="card">
              <div className="card-label">🔄 Avg Reliability</div>
              <div className="card-value">{analytics?.averageReliability?.toFixed(1) ?? '—'} / 100</div>
            </div>
          </div>
        </>
      )}

      {/* ORGANIZATION TAB */}
      {activeTab === 'organization' && (
        <div className="section">
          <h3 className="section-title">All Workers <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px' }}>ACTUAL</span></h3>
          {profiles.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No worker profiles yet. Use POST /api/workforce/hiring to start hiring.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Performance</th><th>Reliability</th></tr></thead>
              <tbody>
                {profiles.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.employee?.name ?? p.employeeId}</td>
                    <td>
                      <span style={{
                        fontSize: '0.7rem', padding: '2px 6px', borderRadius: '3px',
                        background: p.workerType === 'HUMAN' ? 'var(--success)' : 'var(--accent)',
                        color: 'var(--bg)',
                      }}>
                        {p.workerType}
                      </span>
                    </td>
                    <td><span className={`badge badge-${p.employee?.status?.toLowerCase()}`}>{p.employee?.status}</span></td>
                    <td>{p.employee?.performance ?? '—'}</td>
                    <td>{p.employee?.reliability ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* MANAGEMENT TAB */}
      {activeTab === 'management' && (
        <>
          <div className="section">
            <h3 className="section-title">Hiring Pipeline</h3>
            {hiringRequests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No hiring requests. Use POST /api/workforce/hiring to create one.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {hiringRequests.map((h: any) => (
                    <tr key={h.id}>
                      <td>{h.title}</td>
                      <td>{h.workerType}</td>
                      <td><span className={`badge badge-${h.status?.toLowerCase()}`}>{h.status}</span></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(h.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="section">
            <h3 className="section-title">Workforce Plans <span style={{ fontSize: '0.65rem', background: 'var(--warning)', color: 'var(--bg)', padding: '1px 4px', borderRadius: '3px' }}>ADVISORY UNTIL APPROVED</span></h3>
            {plans.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No workforce plans yet.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Title</th><th>Period</th><th>Status</th><th>Headcount</th><th>Advisory</th></tr></thead>
                <tbody>
                  {plans.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{p.period}</td>
                      <td><span className={`badge badge-${p.status?.toLowerCase()}`}>{p.status}</span></td>
                      <td>{p.plannedHeadcount}</td>
                      <td>{p.isAdvisory ? '⚠ Advisory' : '✓ Approved'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* TALENT TAB */}
      {activeTab === 'talent' && (
        <div className="section">
          <h3 className="section-title">Skills & Performance</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Manage skills at <code>POST /api/workforce/skills/:employeeId</code> |
            Performance reviews at <code>POST /api/workforce/reviews/:employeeId</code> |
            Bonuses at <code>POST /api/workforce/bonuses/:employeeId/propose</code>
          </p>
          <div className="card" style={{ marginTop: 'var(--space-3)' }}>
            <div className="card-label">Skill Verification Rules</div>
            <ul style={{ margin: 'var(--space-2) 0', paddingLeft: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <li>Skills start <strong>UNVERIFIED</strong> by default</li>
              <li>Only a different authorized employee can verify a skill</li>
              <li>AI-generated skill claims do NOT auto-verify</li>
              <li>Proficiency levels: NOVICE → BASIC → INTERMEDIATE → ADVANCED → EXPERT</li>
            </ul>
          </div>
        </div>
      )}

      {/* AI WORKFORCE TAB */}
      {activeTab === 'ai' && (
        <>
          <div style={{ padding: 'var(--space-3)', background: 'rgba(255,200,0,0.08)', border: '2px solid var(--warning)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)' }}>
            <strong>⚠ AI Workforce Governance</strong>
            <p style={{ margin: 0, fontSize: '0.8rem', marginTop: 'var(--space-1)' }}>
              AI workers operate under strict governance. They CANNOT: approve their own promotion, award themselves bonuses,
              grant themselves permissions, create unrestricted AI workers, impersonate Chairman, or bypass approval chains.
              All AI recommendations are <strong>ADVISORY ONLY</strong> until a human authorizes them.
            </p>
          </div>
          <div className="metrics-grid">
            <div className="card">
              <div className="card-label">🤖 Total AI Workers</div>
              <div className="card-value">{aiWorkers.length}</div>
            </div>
          </div>
          {aiWorkers.length > 0 && (
            <div className="section">
              <h3 className="section-title">AI Workers</h3>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Autonomy</th><th>Status</th><th>Model</th></tr></thead>
                <tbody>
                  {aiWorkers.map((w: any) => (
                    <tr key={w.id}>
                      <td>{w.employee?.name}</td>
                      <td><span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '3px', background: 'var(--accent)', color: 'var(--bg)' }}>{w.workerType}</span></td>
                      <td>{w.autonomyLevel}</td>
                      <td><span className={`badge badge-${w.employee?.status?.toLowerCase()}`}>{w.employee?.status}</span></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{w.aiModel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="section">
            <h3 className="section-title">AI Provisioning</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Provision AI workers at <code>POST /api/workforce/ai/provision</code> |
              HIGH_AUTONOMY requires Chairman approval |
              Provisioning requires PROPOSAL → APPROVAL → EXECUTE lifecycle
            </p>
          </div>
        </>
      )}
    </>
  );
}
