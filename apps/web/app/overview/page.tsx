'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { chairmanFetch } from '../lib/api';
import { formatINRWhole, timeAgo } from '../components/ui';
import ClientMapCard from '../components/ClientMapCard';

interface Survival { status: string; balancePaise: number }
interface SimState { status: string; currentTick: number }
interface Lead { status: string }
interface Project { id: string; status: string; quotedAmount: number | null; paidAt: string | null; updatedAt: string; lead: { name: string } | null }
interface FeedItem { id: string; at: string; kind: string; title: string; detail?: string }

const OPEN_LEAD = ['NEW', 'CONTACTED', 'QUALIFIED'];
const OPEN_PROJECT = ['SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED'];
const WEEK = 7 * 86_400_000;

const survivalBadge = (s: string) => (s === 'HEALTHY' ? 'badge-success' : s === 'SHUTDOWN' ? 'badge-danger' : 'badge-warning');
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function OverviewPage() {
  const [survival, setSurvival] = useState<Survival | null>(null);
  const [sim, setSim] = useState<SimState | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [groupReport, setGroupReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);

  useEffect(() => {
    const companyId = localStorage.getItem('aevora_company_id');
    setIsGroupMode(!companyId);

    if (!companyId) {
      // Fetch group report
      chairmanFetch<any[]>('/groups').then(r => {
        if (r.data && r.data.length > 0) {
          chairmanFetch<any>(`/groups/${r.data[0].id}/report`).then(reportRes => {
            setGroupReport(reportRes.data);
            setLoaded(true);
          });
        } else {
          setLoaded(true);
        }
      });
    } else {
      // Company specific fetch
      Promise.all([
        chairmanFetch<Survival>('/survival/status'),
        chairmanFetch<SimState>('/simulation/status'),
        chairmanFetch<Lead[]>('/lead-gen/leads'),
        chairmanFetch<Project[]>('/delivery/projects'),
        chairmanFetch<FeedItem[]>('/ceo/feed'),
      ]).then(([s, st, l, p, f]) => {
        setSurvival(s.data);
        setSim(st.data);
        setLeads(l.data ?? []);
        setProjects(p.data ?? []);
        setFeed((f.data ?? []).slice(0, 5));
        setError(s.error ?? st.error ?? l.error ?? p.error ?? f.error);
        setLoaded(true);
      });
    }
  }, []);

  if (!loaded) return <div className="state-loading">Loading overview…</div>;

  if (isGroupMode) {
    return (
      <>
        <div className="page-header flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">Group Overview</h1>
            <p className="page-desc">SAAHVIK Tech — {groupReport?.groupName || 'Group Dashboard'}</p>
          </div>
        </div>

        <div className="metrics-grid">
          <div className="stat-card">
            <div className="stat-label">Companies</div>
            <div className="stat-value">{groupReport?.companyCount || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Employees</div>
            <div className="stat-value">{groupReport?.totalEmployees || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Projects</div>
            <div className="stat-value">{groupReport?.activeProjects || 0}</div>
          </div>
        </div>

        <section className="card" style={{ marginTop: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)' }}>Company Status</h3>
          <table className="table">
            <thead>
              <tr><th>Company</th><th>Simulation</th><th>Employees</th></tr>
            </thead>
            <tbody>
              {groupReport?.companies?.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.simulationStatus} (Tick: {c.tick})</td>
                  <td>{c.employees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }

  const openProjects = projects.filter((p) => OPEN_PROJECT.includes(p.status));
  const weekRevenue = projects
    .filter((p) => p.paidAt && Date.now() - new Date(p.paidAt).getTime() < WEEK)
    .reduce((sum, p) => sum + (p.quotedAmount ?? 0), 0);

  return (
    <>
      <div className="page-header flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-desc">SAAHVIK Tech — Chairman dashboard</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {survival && <span className={`badge ${survivalBadge(survival.status)}`}>{survival.status}</span>}
          {sim && <span className={`badge ${sim.status === 'RUNNING' ? 'badge-success' : 'badge-neutral'}`}>Simulation {label(sim.status)}</span>}
        </div>
      </div>

      {error && <div className="state-error" style={{ marginBottom: 'var(--space-6)' }}>{error}</div>}

      <div className="metrics-grid">
        <div className="stat-card">
          <div className="stat-label">Real balance</div>
          <div className="stat-value">{survival ? formatINRWhole(survival.balancePaise) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active leads</div>
          <div className="stat-value">{leads.filter((l) => OPEN_LEAD.includes(l.status)).length}</div>
          <div className="stat-sub">{leads.length} found in total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open projects</div>
          <div className="stat-value">{openProjects.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This week revenue</div>
          <div className="stat-value">{formatINRWhole(weekRevenue)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
        <section className="card">
          <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)' }}>CEO Activity</h3>
          {feed.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
              <div className="empty-state-title">No CEO activity yet</div>
              <div className="empty-state-desc">Start the simulation to begin.</div>
            </div>
          ) : (
            <table className="table">
              <tbody>
                {feed.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-3)', paddingLeft: 0 }}>{timeAgo(item.at)}</td>
                    <td><span className="badge badge-neutral">{label(item.kind)}</span></td>
                    <td style={{ color: 'var(--text)' }}>{item.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <ChairmanCommandInterface />
      </div>

      <ClientMapCard />

      <section className="card">
        <div className="flex-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--text-base)' }}>Pipeline</h3>
          <Link href="/delivery" style={{ fontSize: 'var(--text-sm)' }}>Delivery</Link>
        </div>
        {openProjects.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <div className="empty-state-title">No active projects</div>
            <div className="empty-state-desc">Find leads to get started.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th style={{ paddingLeft: 0 }}>Business</th><th>Stage</th><th>Value</th><th>Days in stage</th></tr>
            </thead>
            <tbody>
              {openProjects.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text)', paddingLeft: 0 }}>{p.lead?.name ?? 'Client project'}</td>
                  <td><span className="badge badge-neutral">{label(p.status)}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.quotedAmount ? formatINRWhole(p.quotedAmount) : '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{daysSince(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function ChairmanCommandInterface() {
  const [commandText, setCommandText] = useState('');
  const [recentCommands, setRecentCommands] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommands();
  }, []);

  async function fetchCommands() {
    const r = await chairmanFetch<any[]>('/chairman/commands');
    if (!r.error && r.data) {
      setRecentCommands(r.data);
    }
  }

  async function submitCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!commandText.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await chairmanFetch<any>('/chairman/commands', { method: 'POST', body: { text: commandText.trim() } });
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? 'Failed to execute command');
    
    setCommandText('');
    fetchCommands();
  }

  return (
    <section className="card">
      <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)' }}>Chairman Command System</h3>
      <form onSubmit={submitCommand} style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          className="input"
          aria-label="Chairman Command"
          value={commandText}
          onChange={(e) => setCommandText(e.target.value)}
          placeholder="e.g. Pause company operations"
          maxLength={1000}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !commandText.trim()}>
          <PaperPlaneRight size={14} aria-hidden="true" /> {busy ? 'Processing…' : 'Execute'}
        </button>
      </form>
      {error && <div className="state-error" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}
      
      {recentCommands.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Recent Commands</h4>
          <table className="table" style={{ fontSize: 'var(--text-sm)' }}>
            <tbody>
              {recentCommands.slice(0, 5).map((cmd) => (
                <tr key={cmd.id}>
                  <td style={{ paddingLeft: 0, color: 'var(--text-3)' }}>{timeAgo(cmd.createdAt)}</td>
                  <td>{cmd.naturalLanguage}</td>
                  <td>
                    <span className={`badge ${cmd.status === 'COMPLETED' ? 'badge-success' : cmd.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>
                      {label(cmd.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
