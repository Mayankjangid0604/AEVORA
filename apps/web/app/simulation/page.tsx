'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/ui';


export default function SimulationPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadSim(); }, []);

  async function loadSim() {
    const res = await api.simulation();
    if (res.error) setError(res.error);
    else setData(res.data);
    setLoading(false);
  }

  async function handlePause() {
    setActionLoading(true);
    await api.pauseSimulation();
    await loadSim();
    setActionLoading(false);
  }

  async function handleStart() {
    setActionLoading(true);
    await api.startSimulation();
    await loadSim();
    setActionLoading(false);
  }

  async function handleResume() {
    setActionLoading(true);
    await api.resumeSimulation();
    await loadSim();
    setActionLoading(false);
  }

  if (loading) return <div className="state-loading">Loading simulation…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;
  if (!data) return <div className="state-empty">Simulation data unavailable</div>;

  const state = data.state;
  const metrics = data.metrics;

  return (
    <>
      <div className="page-header">
        <h2>⏱️ Simulation Control</h2>
        <p>Status: <StatusBadge status={state?.status || 'UNKNOWN'} /></p>
      </div>

      <div className="detail-grid">
        <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={state?.status || 'UNKNOWN'} /></div></div>
        <div className="detail-item"><div className="detail-label">Current Tick</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)'}}>{state?.currentTick ?? '—'}</div></div>
        <div className="detail-item"><div className="detail-label">Simulation Time</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)', fontSize: '0.8rem'}}>{state?.simulationTime ? new Date(state.simulationTime).toLocaleString() : '—'}</div></div>
        <div className="detail-item"><div className="detail-label">Events Processed</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)'}}>{state?.processedEvents ?? 0}</div></div>
        <div className="detail-item"><div className="detail-label">Events Failed</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)', color: (state?.failedEvents || 0) > 0 ? 'var(--severity-critical)' : 'var(--text-primary)'}}>{state?.failedEvents ?? 0}</div></div>
        {metrics && (
          <>
            <div className="detail-item"><div className="detail-label">Active Agents</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)'}}>{metrics.activeAgents}</div></div>
            <div className="detail-item"><div className="detail-label">Active Tasks</div><div className="detail-value" style={{fontFamily: 'var(--font-mono)'}}>{metrics.activeTasks}</div></div>
          </>
        )}
      </div>

      <div className="section" style={{marginTop: 'var(--space-6)'}}>
        <h3 className="section-title">Controls</h3>
        <div className="action-bar" style={{marginBottom: 'var(--space-4)'}}>
          <button className="btn btn-primary" onClick={handleStart} disabled={actionLoading || state?.status !== 'STOPPED'}>🚀 Start</button>
          <button className="btn btn-primary" onClick={handlePause} disabled={actionLoading || state?.status !== 'RUNNING'}>⏸ Pause</button>
          <button className="btn btn-success" onClick={handleResume} disabled={actionLoading || state?.status !== 'PAUSED'}>▶ Resume</button>
        </div>

      </div>
    </>
  );
}
