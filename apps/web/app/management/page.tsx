'use client';

import { useState, useEffect } from 'react';
import { API_BASE, authHeaders, getToken } from '../lib/api';
import WeeklyReports from '../components/WeeklyReports';

type HealthStatus = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'CRITICAL';
type ArtifactType = 'FACT' | 'ANALYSIS' | 'RECOMMENDATION' | 'DECISION' | 'EXECUTION';

interface HealthSnapshot {
  status: HealthStatus;
  financialScore: number;
  salesScore: number;
  marketingScore: number;
  workforceScore: number;
  operationsScore: number;
  customerScore: number;
  reasons: string[];
  snapshotAt: string;
}

interface Objective {
  id: string;
  title: string;
  priority: string;
  status: string;
  progress: number;
  targetDate: string | null;
}

interface DashboardKpi {
  id: string;
  name: string;
  category: string;
  status: string;
  trend: string;
  currentValue: number;
  target: number;
  unit: string;
  progress: number;
}

interface KpiDashboard {
  summary: {
    total: number;
    onTrack: number;
    atRisk: number;
    offTrack: number;
    critical: number;
    improving: number;
    declining: number;
  };
  kpis: DashboardKpi[];
}

interface Decision {
  id: string;
  subject: string;
  decisionType: string;
  status: string;
  priority: string;
  artifactType: ArtifactType;
  riskLevel: string;
  proposedAt: string;
}

interface Risk {
  id: string;
  title: string;
  probability: string;
  impact: string;
  score: number;
  status: string;
  isAdvisory: boolean;
}

interface Escalation {
  id: string;
  title: string;
  reason: string;
  priority: string;
  riskLevel: string;
  status: string;
  escalatedTo: string;
  createdAt: string;
}

const HEALTH_COLORS: Record<HealthStatus, string> = {
  HEALTHY: '#22c55e',
  WATCH: '#f59e0b',
  AT_RISK: '#f97316',
  CRITICAL: '#ef4444',
};

const ARTIFACT_BADGES: Record<ArtifactType, { label: string; color: string }> = {
  FACT: { label: 'FACT', color: '#3b82f6' },
  ANALYSIS: { label: 'ANALYSIS', color: '#8b5cf6' },
  RECOMMENDATION: { label: 'RECOMMENDATION', color: '#f59e0b' },
  DECISION: { label: 'DECISION', color: '#10b981' },
  EXECUTION: { label: 'EXECUTION', color: '#6b7280' },
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : score >= 30 ? '#f97316' : '#ef4444';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 600 }}>{score}</span>
      </div>
      <div style={{ background: '#1f2937', borderRadius: 4, height: 6 }}>
        <div style={{ width: `${score}%`, background: color, borderRadius: 4, height: '100%', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    HEALTHY: '#22c55e', WATCH: '#f59e0b', AT_RISK: '#f97316', CRITICAL: '#ef4444',
    ACTIVE: '#22c55e', COMPLETED: '#3b82f6', CANCELLED: '#6b7280',
    PROPOSED: '#8b5cf6', APPROVED: '#10b981', REJECTED: '#ef4444',
    PENDING: '#f59e0b', ACKNOWLEDGED: '#3b82f6', RESOLVED: '#22c55e', DISMISSED: '#6b7280',
    IDENTIFIED: '#f59e0b', MITIGATING: '#f97316', ACCEPTED: '#6b7280',
    HIGH: '#f97316', LOW: '#22c55e', MEDIUM: '#f59e0b', NORMAL: '#3b82f6',
  };
  const c = colors[status] ?? '#9ca3af';
  return (
    <span style={{ background: `${c}22`, color: c, border: `1px solid ${c}44`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {status}
    </span>
  );
}

function ArtifactBadge({ type }: { type: ArtifactType | string }) {
  const badge = ARTIFACT_BADGES[type as ArtifactType] ?? { label: type, color: '#6b7280' };
  return (
    <span style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44`, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const }}>
      {badge.label}
    </span>
  );
}

export default function ManagementPage() {
  type Tab = 'dashboard' | 'reports' | 'decisions' | 'risks' | 'escalations' | 'objectives' | 'kpis';
  const [tab, setTab] = useState<Tab>('dashboard');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'reports') setTab('reports');
  }, []);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [kpiDashboard, setKpiDashboard] = useState<KpiDashboard | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [cycleMessage, setCycleMessage] = useState('');

  const token = typeof window !== 'undefined' ? getToken() : null;

  const apiFetch = async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.allSettled([
      apiFetch('/management/health/latest').then(setHealth),
      apiFetch('/management/objectives').then(setObjectives),
      apiFetch('/management/kpis/dashboard').then(setKpiDashboard).catch(() => {}),
      apiFetch('/management/decisions').then(setDecisions),
      apiFetch('/management/risks').then(setRisks),
      apiFetch('/management/escalations?status=PENDING').then(setEscalations),
    ]).finally(() => setLoading(false));
  }, [token]);

  const runDailyCycle = async () => {
    setCycleRunning(true);
    setCycleMessage('');
    try {
      await apiFetch('/management/cycles', { method: 'POST', body: JSON.stringify({ cycleType: 'DAILY' }) });
      setCycleMessage('Daily management cycle completed.');
      // Refresh health
      apiFetch('/management/health/latest').then(setHealth);
      apiFetch('/management/risks').then(setRisks);
      apiFetch('/management/escalations?status=PENDING').then(setEscalations);
    } catch (e: any) {
      setCycleMessage(`Cycle error: ${e.message}`);
    } finally {
      setCycleRunning(false);
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111827', color: '#9ca3af', fontFamily: 'monospace' }}>
        Authentication required.
      </div>
    );
  }

  const criticalRisks = risks.filter(r => (r.probability === 'CRITICAL' || r.impact === 'CRITICAL') && r.status !== 'RESOLVED');
  const highRisks = risks.filter(r => (r.probability === 'HIGH' || r.impact === 'HIGH') && r.status !== 'RESOLVED' && !(r.probability === 'CRITICAL' || r.impact === 'CRITICAL'));
  const atRiskObjectives = objectives.filter(o => o.status === 'AT_RISK');

  return (
    <div style={{ minHeight: '100vh', background: '#111827', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Company Management</h1>
          <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 14 }}>Autonomous Company Operating System — Phase 30</p>
        </div>
        <button
          onClick={runDailyCycle}
          disabled={cycleRunning}
          style={{ background: cycleRunning ? '#374151' : '#4f46e5', color: '#f9fafb', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: cycleRunning ? 'wait' : 'pointer', fontWeight: 600 }}
        >
          {cycleRunning ? 'Running Cycle…' : 'Run Daily Cycle'}
        </button>
      </div>

      {cycleMessage && (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#a7f3d0', fontSize: 14 }}>
          {cycleMessage}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #374151', paddingBottom: 0 }}>
        {(['dashboard', 'reports', 'kpis', 'decisions', 'risks', 'escalations', 'objectives'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#1f2937' : 'transparent',
              color: tab === t ? '#f9fafb' : '#6b7280',
              border: 'none',
              borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
              textTransform: 'capitalize',
              fontSize: 14,
            }}
          >
            {t}
            {t === 'escalations' && escalations.length > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 9999, padding: '0 6px', fontSize: 10, marginLeft: 6 }}>
                {escalations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>Loading…</div>}

      {/* Dashboard Tab */}
      {!loading && tab === 'dashboard' && (
        <div>
          {/* Health Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: '#1f2937', borderRadius: 12, padding: 20, border: health ? `1px solid ${HEALTH_COLORS[health.status]}44` : '1px solid #374151' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Company Health</h2>
                {health && (
                  <span style={{ background: `${HEALTH_COLORS[health.status]}22`, color: HEALTH_COLORS[health.status], border: `1px solid ${HEALTH_COLORS[health.status]}44`, borderRadius: 8, padding: '4px 12px', fontWeight: 700, fontSize: 13 }}>
                    {health.status}
                  </span>
                )}
              </div>
              {health ? (
                <>
                  <ScoreBar label="Financial" score={health.financialScore} />
                  <ScoreBar label="Sales" score={health.salesScore} />
                  <ScoreBar label="Marketing" score={health.marketingScore} />
                  <ScoreBar label="Workforce" score={health.workforceScore} />
                  <ScoreBar label="Operations" score={health.operationsScore} />
                  <ScoreBar label="Customers" score={health.customerScore} />
                  {health.reasons.length > 0 && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#111827', borderRadius: 8 }}>
                      {health.reasons.map((r, i) => (
                        <div key={i} style={{ color: '#fbbf24', fontSize: 12, marginBottom: 2 }}>⚠ {r}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ color: '#4b5563', fontSize: 11, marginTop: 8 }}>
                    ANALYSIS — not authoritative data. Last updated: {new Date(health.snapshotAt).toLocaleString()}
                  </div>
                </>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 14 }}>No snapshot yet. Run Daily Cycle to generate.</div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#1f2937', borderRadius: 12, padding: 16, border: '1px solid #374151' }}>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Active Objectives</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{objectives.filter(o => o.status === 'ACTIVE').length}</div>
                  <div style={{ color: '#f97316', fontSize: 11, marginTop: 4 }}>{atRiskObjectives.length} at risk</div>
                </div>
                <div style={{ background: '#1f2937', borderRadius: 12, padding: 16, border: '1px solid #374151' }}>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Open Decisions</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{decisions.filter(d => !['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(d.status)).length}</div>
                  <div style={{ color: '#8b5cf6', fontSize: 11, marginTop: 4 }}>RECOMMENDATION → awaiting review</div>
                </div>
                <div style={{ background: '#1f2937', borderRadius: 12, padding: 16, border: criticalRisks.length > 0 ? '1px solid #ef444444' : '1px solid #374151' }}>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Critical Risks</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: criticalRisks.length > 0 ? '#ef4444' : '#f9fafb' }}>{criticalRisks.length}</div>
                  <div style={{ color: '#f97316', fontSize: 11, marginTop: 4 }}>{highRisks.length} high</div>
                </div>
                <div style={{ background: '#1f2937', borderRadius: 12, padding: 16, border: escalations.length > 0 ? '1px solid #fbbf2444' : '1px solid #374151' }}>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Pending Escalations</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: escalations.length > 0 ? '#fbbf24' : '#f9fafb' }}>{escalations.length}</div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>Chairman queue</div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ background: '#1f2937', borderRadius: 12, padding: 16, border: '1px solid #374151' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#9ca3af' }}>Artifact Types</div>
                {Object.entries(ARTIFACT_BADGES).map(([type]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <ArtifactBadge type={type as ArtifactType} />
                    <span style={{ color: '#6b7280', fontSize: 12 }}>
                      {type === 'FACT' && 'Recorded by authoritative domain system'}
                      {type === 'ANALYSIS' && 'Computed interpretation of facts'}
                      {type === 'RECOMMENDATION' && 'AI/management suggestion'}
                      {type === 'DECISION' && 'Authorized management decision'}
                      {type === 'EXECUTION' && 'Actual domain mutation in progress'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Escalations Banner */}
          {escalations.length > 0 && (
            <div style={{ background: '#7c2d12', border: '1px solid #f97316', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#fed7aa' }}>⚡ Chairman Decision Queue ({escalations.length} pending)</div>
              {escalations.slice(0, 3).map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #92400e' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#fef3c7' }}>{e.title}</span>
                    <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>{e.reason.slice(0, 60)}…</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge status={e.priority} />
                    <StatusBadge status={e.riskLevel} />
                  </div>
                </div>
              ))}
              {escalations.length > 3 && <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>…and {escalations.length - 3} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Decisions Tab */}
      {!loading && tab === 'decisions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Executive Decisions</h2>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>AI agents propose RECOMMENDATIONS — humans approve DECISIONS</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {decisions.length === 0 && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>No decisions yet.</div>}
            {decisions.map(d => (
              <div key={d.id} style={{ background: '#1f2937', borderRadius: 10, padding: '14px 18px', border: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.subject}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{d.decisionType} · {new Date(d.proposedAt).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <ArtifactBadge type={d.artifactType as ArtifactType} />
                  <StatusBadge status={d.priority} />
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks Tab */}
      {!loading && tab === 'risks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Company Risks</h2>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>Risk scores are ANALYSIS — not authoritative facts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {risks.length === 0 && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>No risks identified yet.</div>}
            {risks.map(r => (
              <div key={r.id} style={{ background: '#1f2937', borderRadius: 10, padding: '14px 18px', border: `1px solid ${r.probability === 'CRITICAL' ? '#ef444444' : '#374151'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>Score: {r.score} · P: {r.probability} · I: {r.impact}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {r.isAdvisory && <ArtifactBadge type="ANALYSIS" />}
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalations Tab */}
      {!loading && tab === 'escalations' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Chairman Decision Queue</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {escalations.length === 0 && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>No pending escalations.</div>}
            {escalations.map(e => (
              <div key={e.id} style={{ background: '#1f2937', borderRadius: 10, padding: '16px 18px', border: '1px solid #374151' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.title}</div>
                    <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>{e.reason}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>Escalated to: {e.escalatedTo} · {new Date(e.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge status={e.priority} />
                    <StatusBadge status={e.riskLevel} />
                    <StatusBadge status={e.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CEO Weekly Reports Tab */}
      {tab === 'reports' && <WeeklyReports />}

      {/* Objectives Tab */}
      {!loading && tab === 'objectives' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Company Objectives</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {objectives.length === 0 && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>No objectives yet.</div>}
            {objectives.map(o => (
              <div key={o.id} style={{ background: '#1f2937', borderRadius: 10, padding: '14px 18px', border: '1px solid #374151' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{o.title}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatusBadge status={o.priority} />
                    <StatusBadge status={o.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, background: '#111827', borderRadius: 4, height: 6 }}>
                    <div style={{ width: `${o.progress}%`, background: o.status === 'AT_RISK' ? '#f97316' : '#22c55e', borderRadius: 4, height: '100%' }} />
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>{o.progress}%</span>
                </div>
                {o.targetDate && (
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>
                    Target: {new Date(o.targetDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs Tab */}
      {!loading && tab === 'kpis' && kpiDashboard && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Company-Wide KPIs</h2>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>Deterministic performance metrics computed from domain systems</div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#1f2937', padding: 12, borderRadius: 8, border: '1px solid #374151', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{kpiDashboard.summary.total}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Total KPIs</div>
            </div>
            <div style={{ background: '#1f2937', padding: 12, borderRadius: 8, border: '1px solid #22c55e44', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{kpiDashboard.summary.onTrack}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>On Track</div>
            </div>
            <div style={{ background: '#1f2937', padding: 12, borderRadius: 8, border: '1px solid #f59e0b44', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{kpiDashboard.summary.atRisk}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>At Risk</div>
            </div>
            <div style={{ background: '#1f2937', padding: 12, borderRadius: 8, border: '1px solid #f9731644', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f97316' }}>{kpiDashboard.summary.offTrack}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Off Track</div>
            </div>
            <div style={{ background: '#1f2937', padding: 12, borderRadius: 8, border: '1px solid #ef444444', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{kpiDashboard.summary.critical}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Critical</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {kpiDashboard.kpis.length === 0 && <div style={{ color: '#6b7280', padding: 32, textAlign: 'center' }}>No KPIs defined yet.</div>}
            {kpiDashboard.kpis.map(k => (
              <div key={k.id} style={{ background: '#1f2937', borderRadius: 10, padding: '14px 18px', border: '1px solid #374151' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{k.name}</div>
                    <span style={{ fontSize: 11, color: '#9ca3af', background: '#111827', padding: '2px 6px', borderRadius: 4 }}>{k.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatusBadge status={k.trend} />
                    <StatusBadge status={k.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Value: <span style={{ color: '#f9fafb', fontWeight: 600 }}>{k.currentValue} {k.unit}</span></div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Target: {k.target} {k.unit}</div>
                </div>
                <div style={{ flex: 1, background: '#111827', borderRadius: 4, height: 6 }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, k.progress))}%`, background: k.status === 'CRITICAL' ? '#ef4444' : k.status === 'OFF_TRACK' ? '#f97316' : k.status === 'AT_RISK' ? '#f59e0b' : '#22c55e', borderRadius: 4, height: '100%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
