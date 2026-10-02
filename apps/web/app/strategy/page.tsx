'use client';

import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/api';

type ArtifactType = 'FACT' | 'ANALYSIS' | 'ASSUMPTION' | 'FORECAST' | 'RECOMMENDATION' | 'DECISION' | 'EXECUTION';
type Horizon = 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
type InitiativeStatus = 'PROPOSED' | 'EVALUATING' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
type ScenarioType = 'BASE' | 'UPSIDE' | 'DOWNSIDE' | 'STRESS';

interface Initiative {
  id: string;
  title: string;
  status: InitiativeStatus;
  horizon: Horizon;
  reversibility: string;
  estimatedCost: number;
  confidence: number;
  isAdvisory: boolean;
}

interface StrategicOption {
  id: string;
  title: string;
  description: string;
  confidence: number;
  isAdvisory: boolean;
  isSelected: boolean;
  estimatedCost: number;
  reversibility: string;
  evaluatedBy: string | null;
}

interface Scenario {
  id: string;
  title: string;
  scenarioType: ScenarioType;
  confidence: number;
  isAdvisory: boolean;
}

interface Forecast {
  id: string;
  forecastType: string;
  version: number;
  value: number;
  confidence: number;
  isAdvisory: boolean;
  actualValue: number | null;
}

interface PortfolioSummary {
  activeInitiatives: number;
  proposedInitiatives: number;
  completedInitiatives: number;
  totalEstimatedCost: number;
  byHorizon: Record<string, number>;
  issues: string[];
  artifactType: ArtifactType;
}

interface ReviewCycle {
  id: string;
  status: string;
  driftDetected: boolean;
  warningSignals: string[];
  gapsIdentified: string[];
  startedAt: string;
  completedAt: string | null;
}

const ARTIFACT_COLOR: Record<ArtifactType, string> = {
  FACT: '#22c55e',
  ANALYSIS: '#3b82f6',
  ASSUMPTION: '#f59e0b',
  FORECAST: '#8b5cf6',
  RECOMMENDATION: '#f97316',
  DECISION: '#ef4444',
  EXECUTION: '#6b7280',
};

function ArtifactBadge({ type }: { type: ArtifactType }) {
  return (
    <span style={{ background: ARTIFACT_COLOR[type], color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
      {type}
    </span>
  );
}

function HorizonBadge({ h }: { h: Horizon }) {
  const colors: Record<Horizon, string> = { SHORT_TERM: '#10b981', MEDIUM_TERM: '#3b82f6', LONG_TERM: '#8b5cf6' };
  return <span style={{ background: colors[h], color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{h.replace('_', ' ')}</span>;
}

function ScenarioBadge({ t }: { t: ScenarioType }) {
  const colors: Record<ScenarioType, string> = { BASE: '#3b82f6', UPSIDE: '#22c55e', DOWNSIDE: '#f59e0b', STRESS: '#ef4444' };
  return <span style={{ background: colors[t], color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{t}</span>;
}

export default function StrategyPage() {
  const [tab, setTab] = useState<'overview' | 'initiatives' | 'options' | 'scenarios' | 'forecasts' | 'portfolio' | 'reviews'>('overview');
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [options, setOptions] = useState<StrategicOption[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [reviews, setReviews] = useState<ReviewCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const API = API_BASE;

  async function load() {
    setLoading(true);
    try {
      const [p, i, o, s, f, r] = await Promise.all([
        fetch(`${API}/strategy/portfolio`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/strategy/initiatives`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/strategy/options`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/strategy/scenarios`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/strategy/forecasts`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/strategy/reviews`).then(r => r.ok ? r.json() : []),
      ]);
      setPortfolio(p);
      setInitiatives(i ?? []);
      setOptions(o ?? []);
      setScenarios(s ?? []);
      setForecasts(f ?? []);
      setReviews(r ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runReview() {
    setMsg('Running strategy review...');
    const r = await fetch(`${API}/strategy/reviews/run`, { method: 'POST' });
    const data = await r.json();
    setMsg(r.ok ? `Review complete. Drift: ${data.driftDetected}. Warnings: ${data.warningSignals?.length ?? 0}` : `Error: ${data.message}`);
    load();
  }

  const tabs = ['overview', 'initiatives', 'options', 'scenarios', 'forecasts', 'portfolio', 'reviews'] as const;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Strategy Center</h1>
      <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 13 }}>
        Autonomous strategy engine — all AI-generated content is labeled <ArtifactBadge type="ANALYSIS" /> or <ArtifactBadge type="FORECAST" /> or <ArtifactBadge type="RECOMMENDATION" /> until explicitly approved.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '6px 14px', borderRadius: 6, border: tab === t ? '2px solid #3b82f6' : '1px solid #d1d5db', background: tab === t ? '#eff6ff' : '#fff', cursor: 'pointer', fontWeight: tab === t ? 700 : 400 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button onClick={runReview} style={{ marginLeft: 'auto', padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Run Strategy Review
        </button>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{msg}</div>}
      {loading && <p style={{ color: '#6b7280' }}>Loading...</p>}

      {/* Overview */}
      {tab === 'overview' && portfolio && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Active Initiatives', value: portfolio.activeInitiatives, color: '#22c55e' },
              { label: 'Proposed', value: portfolio.proposedInitiatives, color: '#f59e0b' },
              { label: 'Completed', value: portfolio.completedInitiatives, color: '#3b82f6' },
              { label: 'Total Cost (est)', value: `₹${portfolio.totalEstimatedCost.toLocaleString()}`, color: '#8b5cf6' },
            ].map(card => (
              <div key={card.label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{card.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: card.color, margin: '4px 0 0' }}>{card.value}</p>
                <ArtifactBadge type="ANALYSIS" />
              </div>
            ))}
          </div>
          {portfolio.issues.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <strong>Portfolio Issues:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{portfolio.issues.map((i, k) => <li key={k} style={{ fontSize: 13 }}>{i}</li>)}</ul>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>By Horizon <ArtifactBadge type="ANALYSIS" /></h3>
              {Object.entries(portfolio.byHorizon).map(([h, count]) => (
                <div key={h} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <HorizonBadge h={h as Horizon} /><span>{count}</span>
                </div>
              ))}
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Recent Reviews</h3>
              {reviews.slice(0, 3).map(r => (
                <div key={r.id} style={{ marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: r.driftDetected ? '#ef4444' : '#22c55e' }}>{r.driftDetected ? '⚠ DRIFT' : '✓ STABLE'}</span>
                  {' — '}{new Date(r.startedAt).toLocaleDateString()}
                  {r.warningSignals.length > 0 && <div style={{ color: '#6b7280', fontSize: 11 }}>{r.warningSignals.join(', ')}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Initiatives */}
      {tab === 'initiatives' && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategic Initiatives</h2>
          {initiatives.length === 0 && <p style={{ color: '#6b7280' }}>No initiatives yet.</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              {['Title', 'Status', 'Horizon', 'Reversibility', 'Confidence', 'Cost', 'Advisory'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{initiatives.map(i => (
              <tr key={i.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px' }}>{i.title}</td>
                <td style={{ padding: '8px 10px' }}><span style={{ background: i.status === 'ACTIVE' ? '#dcfce7' : i.status === 'APPROVED' ? '#dbeafe' : '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{i.status}</span></td>
                <td style={{ padding: '8px 10px' }}><HorizonBadge h={i.horizon} /></td>
                <td style={{ padding: '8px 10px' }}>{i.reversibility}</td>
                <td style={{ padding: '8px 10px' }}>{i.confidence}%</td>
                <td style={{ padding: '8px 10px' }}>₹{i.estimatedCost.toLocaleString()}</td>
                <td style={{ padding: '8px 10px' }}><ArtifactBadge type={i.isAdvisory ? 'RECOMMENDATION' : 'DECISION'} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Options */}
      {tab === 'options' && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategic Options <ArtifactBadge type="RECOMMENDATION" /></h2>
          <p style={{ fontSize: 12, color: '#6b7280' }}>All options are advisory until selected by an authorized non-generator actor.</p>
          {options.length === 0 && <p style={{ color: '#6b7280' }}>No options yet.</p>}
          {options.map(o => (
            <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <strong>{o.title}</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ArtifactBadge type={o.isSelected ? 'DECISION' : 'RECOMMENDATION'} />
                  {o.isSelected && <span style={{ background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>SELECTED</span>}
                </div>
              </div>
              <p style={{ color: '#6b7280', fontSize: 13, margin: '6px 0' }}>{o.description}</p>
              <div style={{ fontSize: 12, color: '#374151' }}>
                Confidence: {o.confidence}% | Cost: ₹{o.estimatedCost.toLocaleString()} | {o.reversibility}
                {o.evaluatedBy && <span style={{ marginLeft: 8, color: '#22c55e' }}>✓ Evaluated</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scenarios */}
      {tab === 'scenarios' && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategic Scenarios <ArtifactBadge type="ANALYSIS" /></h2>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Scenarios are explicitly hypothetical and never write to authoritative financial records.</p>
          {scenarios.length === 0 && <p style={{ color: '#6b7280' }}>No scenarios yet.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {scenarios.map(s => (
              <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ScenarioBadge t={s.scenarioType} />
                  <ArtifactBadge type="ANALYSIS" />
                </div>
                <strong style={{ fontSize: 14 }}>{s.title}</strong>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Confidence: {s.confidence}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forecasts */}
      {tab === 'forecasts' && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategic Forecasts <ArtifactBadge type="FORECAST" /></h2>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Forecasts are projections only. They do not modify Phase 28 financial records.</p>
          {forecasts.length === 0 && <p style={{ color: '#6b7280' }}>No forecasts yet.</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              {['Type', 'Version', 'Forecast', 'Range', 'Confidence', 'Actual'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{forecasts.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px' }}>{f.forecastType}</td>
                <td style={{ padding: '8px 10px' }}>v{f.version}</td>
                <td style={{ padding: '8px 10px' }}>₹{f.value.toLocaleString()}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: 11 }}>±{f.value > 0 ? Math.round(((f as any).valueHigh - (f as any).valueLow) / 2).toLocaleString() : 0}</td>
                <td style={{ padding: '8px 10px' }}>{f.confidence}%</td>
                <td style={{ padding: '8px 10px' }}>{f.actualValue !== null ? `₹${f.actualValue.toLocaleString()}` : <span style={{ color: '#9ca3af' }}>Pending</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Portfolio */}
      {tab === 'portfolio' && portfolio && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategic Portfolio <ArtifactBadge type="ANALYSIS" /></h2>
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
              This is an analytical view. Portfolio recommendations do not automatically authorize resource allocation, workforce changes, or financial commitments.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'Active', val: portfolio.activeInitiatives, bg: '#dcfce7' },
              { label: 'Proposed', val: portfolio.proposedInitiatives, bg: '#fef3c7' },
              { label: 'Total Est. Cost', val: `₹${portfolio.totalEstimatedCost.toLocaleString()}`, bg: '#ede9fe' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{c.val}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
          {portfolio.issues.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 14, marginTop: 16 }}>
              <strong>Issues Detected <ArtifactBadge type="ANALYSIS" /></strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{portfolio.issues.map((i, k) => <li key={k} style={{ fontSize: 13 }}>{i}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      {tab === 'reviews' && (
        <div>
          <h2 style={{ fontSize: 16 }}>Strategy Reviews</h2>
          {reviews.length === 0 && <p style={{ color: '#6b7280' }}>No reviews yet. Click &quot;Run Strategy Review&quot; to begin.</p>}
          {reviews.map(r => (
            <div key={r.id} style={{ border: `1px solid ${r.driftDetected ? '#fcd34d' : '#d1fae5'}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: r.driftDetected ? '#b45309' : '#065f46' }}>
                  {r.driftDetected ? '⚠ Drift Detected' : '✓ No Drift'}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{new Date(r.startedAt).toLocaleString()}</span>
              </div>
              {r.warningSignals.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: 12 }}>Warning Signals:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.warningSignals.map((s, k) => <li key={k} style={{ fontSize: 12 }}>{s}</li>)}</ul>
                </div>
              )}
              {r.gapsIdentified.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: 12 }}>Gaps:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.gapsIdentified.map((g, k) => <li key={k} style={{ fontSize: 12 }}>{g}</li>)}</ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
