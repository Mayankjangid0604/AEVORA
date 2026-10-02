'use client';

import { useEffect, useState, useCallback } from 'react';
import { chairmanFetch } from '../lib/api';

interface Command { id: string; naturalLanguage: string; status: string; riskLevel: string; parsedIntent: string; createdAt: string; executionNotes?: string; }
interface Alert { id: string; title: string; description: string; severity: string; category: string; status: string; createdAt: string; }
interface Decision { id: string; title: string; description: string; status: string; proposedAt: string; }

type Tab = 'overview' | 'commands' | 'alerts' | 'decisions' | 'financials' | 'ooda';

export default function ChairmanDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [financials, setFinancials] = useState<any>(null);
  const [financeAuth, setFinanceAuth] = useState<any>(null);
  const [commandText, setCommandText] = useState('');
  const [loading, setLoading] = useState(false);
  const [cmdFilter, setCmdFilter] = useState<{ status?: string; riskLevel?: string }>({});
  const [oodaCycles, setOodaCycles] = useState<any[]>([]);
  const [oodaPending, setOodaPending] = useState<any[]>([]);
  const [agentPerf, setAgentPerf] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ov, cmd, al, dec, fin, fAuth, cycles, pending, perf] = await Promise.all([
      chairmanFetch('/chairman/overview'),
      chairmanFetch<Command[]>(`/chairman/commands${buildQuery(cmdFilter)}`),
      chairmanFetch<Alert[]>('/chairman/alerts'),
      chairmanFetch<Decision[]>('/chairman/decisions'),
      chairmanFetch('/chairman/financials'),
      chairmanFetch('/ceo/financial-authority'),
      chairmanFetch<any[]>('/chairman/operating-loop/cycles'),
      chairmanFetch<any[]>('/chairman/operating-loop/pending'),
      chairmanFetch<any>('/chairman/agent-performance'),
    ]);
    if (ov.data) setOverview(ov.data);
    if (cmd.data) setCommands(cmd.data);
    if (al.data) setAlerts(al.data);
    if (dec.data) setDecisions(dec.data);
    if (fin.data) setFinancials(fin.data);
    if (fAuth.data) setFinanceAuth(fAuth.data);
    if (cycles.data) setOodaCycles(cycles.data);
    if (pending.data) setOodaPending(pending.data);
    if (perf.data) setAgentPerf(perf.data);
    setLoading(false);
  }, [cmdFilter]);

  useEffect(() => { load(); }, [load]);

  const submitCommand = async () => {
    if (!commandText.trim()) return;
    await chairmanFetch('/chairman/commands', { method: 'POST', body: { text: commandText } });
    setCommandText('');
    load();
  };

  const approveCommand = async (id: string) => { await chairmanFetch(`/chairman/commands/${id}/approve`, { method: 'POST' }); load(); };
  const rejectCommand = async (id: string) => { await chairmanFetch(`/chairman/commands/${id}/reject`, { method: 'POST' }); load(); };
  const approveDecision = async (id: string) => { await chairmanFetch(`/chairman/decisions/${id}/approve`, { method: 'POST' }); load(); };
  const rejectDecision = async (id: string) => { await chairmanFetch(`/chairman/decisions/${id}/reject`, { method: 'POST' }); load(); };
  const resolveAlert = async (id: string) => { await chairmanFetch(`/chairman/alerts/${id}/resolve`, { method: 'POST' }); load(); };
  const markAlertRead = async (id: string) => { await chairmanFetch(`/chairman/alerts/${id}/read`, { method: 'POST' }); load(); };

  const pendingCommands = commands.filter(c => c.status === 'AWAITING_APPROVAL');
  const pendingDecisions = decisions.filter(d => d.status === 'PROPOSED');
  const unresolvedAlerts = alerts.filter(a => a.status !== 'RESOLVED');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'commands', label: 'Commands', badge: pendingCommands.length || undefined },
    { key: 'alerts', label: 'Alerts', badge: unresolvedAlerts.length || undefined },
    { key: 'decisions', label: 'Decisions', badge: pendingDecisions.length || undefined },
    { key: 'financials', label: 'Financials' },
    { key: 'ooda', label: 'Operating Loop', badge: oodaPending.length || undefined },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Chairman Executive Control</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        {loading ? 'Loading...' : `${pendingCommands.length} pending commands · ${unresolvedAlerts.length} alerts · ${pendingDecisions.length} pending decisions`}
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e2e2', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', border: 'none', borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none', cursor: 'pointer', fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? '#2563eb' : '#555', fontSize: 14,
          }}>
            {t.label}{t.badge ? ` (${t.badge})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && overview && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat label="Employees" value={overview.employeeCount ?? '—'} />
            <Stat label="Active Projects" value={overview.activeProjects ?? '—'} />
            <Stat label="Revenue" value={overview.revenue != null ? `$${Number(overview.revenue).toLocaleString()}` : '—'} />
            <Stat label="Company Status" value={overview.simulationStatus ?? overview.status ?? '—'} />
          </div>
          {pendingCommands.length > 0 && (
            <Section title="Pending Approvals">
              {pendingCommands.map(c => (
                <CommandRow key={c.id} cmd={c} onApprove={() => approveCommand(c.id)} onReject={() => rejectCommand(c.id)} />
              ))}
            </Section>
          )}
          {unresolvedAlerts.length > 0 && (
            <Section title="Active Alerts">
              {unresolvedAlerts.slice(0, 5).map(a => (
                <AlertRow key={a.id} alert={a} onResolve={() => resolveAlert(a.id)} onRead={() => markAlertRead(a.id)} />
              ))}
            </Section>
          )}
        </div>
      )}

      {tab === 'commands' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={commandText} onChange={e => setCommandText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitCommand()}
              placeholder="Type a command..." style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            <button onClick={submitCommand} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Send</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={cmdFilter.status || ''} onChange={e => setCmdFilter(f => ({ ...f, status: e.target.value || undefined }))} style={selectStyle}>
              <option value="">All Statuses</option>
              {['AWAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={cmdFilter.riskLevel || ''} onChange={e => setCmdFilter(f => ({ ...f, riskLevel: e.target.value || undefined }))} style={selectStyle}>
              <option value="">All Risk</option>
              {['LOW', 'MEDIUM', 'HIGH'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {commands.map(c => (
            <CommandRow key={c.id} cmd={c}
              onApprove={c.status === 'AWAITING_APPROVAL' ? () => approveCommand(c.id) : undefined}
              onReject={c.status === 'AWAITING_APPROVAL' ? () => rejectCommand(c.id) : undefined} />
          ))}
          {commands.length === 0 && <p style={{ color: '#888' }}>No commands found.</p>}
        </div>
      )}

      {tab === 'alerts' && (
        <div>
          {alerts.map(a => (
            <AlertRow key={a.id} alert={a} onResolve={() => resolveAlert(a.id)} onRead={() => markAlertRead(a.id)} />
          ))}
          {alerts.length === 0 && <p style={{ color: '#888' }}>No alerts.</p>}
        </div>
      )}

      {tab === 'decisions' && (
        <div>
          {decisions.map(d => (
            <div key={d.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{d.title}</strong>
                  <StatusBadge status={d.status} />
                  <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>{d.description}</p>
                  <p style={{ margin: '2px 0 0', color: '#999', fontSize: 12 }}>{new Date(d.proposedAt).toLocaleString()}</p>
                </div>
                {d.status === 'PROPOSED' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => approveDecision(d.id)} style={approveBtn}>Approve</button>
                    <button onClick={() => rejectDecision(d.id)} style={rejectBtn}>Reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {decisions.length === 0 && <p style={{ color: '#888' }}>No decisions.</p>}
        </div>
      )}

      {tab === 'financials' && (
        <div>
          {financials && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
              <Stat label="Total Revenue" value={financials.totalRevenue != null ? `$${Number(financials.totalRevenue).toLocaleString()}` : '—'} />
              <Stat label="Total Expenses" value={financials.totalExpenses != null ? `$${Number(financials.totalExpenses).toLocaleString()}` : '—'} />
              <Stat label="Profit" value={financials.profit != null ? `$${Number(financials.profit).toLocaleString()}` : '—'} />
              <Stat label="Balance" value={financials.balance != null ? `$${Number(financials.balance).toLocaleString()}` : '—'} />
            </div>
          )}

          <Section title="CEO Financial Authority">
            {!financeAuth?.active || !financeAuth?.authority ? (
              <div style={cardStyle}>
                <p style={{ color: '#6b7280', fontSize: 14 }}>The CEO currently has no delegated financial authority.</p>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                   {/* We would render a form here to grant authority, but for now we just show it */}
                   <span style={{ fontSize: 12, color: '#888' }}>(Grant via API or CLI)</span>
                </div>
              </div>
            ) : (
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Authority Status: <span style={{ color: financeAuth.authority.authorityStatus === 'ACTIVE' ? '#10b981' : '#ef4444' }}>{financeAuth.authority.authorityStatus}</span></div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <Stat label="Per Transaction Limit" value={`₹${financeAuth.authority.singleTransactionLimit.toLocaleString()}`} />
                  <Stat label={`Daily Limit (Used: ₹${financeAuth.usage?.dailyUsed?.toLocaleString() || 0})`} value={`₹${financeAuth.authority.dailyLimit.toLocaleString()}`} />
                  <Stat label={`Monthly Limit (Used: ₹${financeAuth.usage?.monthlyUsed?.toLocaleString() || 0})`} value={`₹${financeAuth.authority.monthlyLimit.toLocaleString()}`} />
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 12 }}>
                  <div><strong>Subject to Budgets:</strong> {financeAuth.authority.budgetLimit ? 'Yes' : 'No'}</div>
                  <div><strong>Chairman Approval Above:</strong> {financeAuth.authority.requiresChairmanApprovalAbove ? `₹${financeAuth.authority.requiresChairmanApprovalAbove.toLocaleString()}` : 'N/A'}</div>
                </div>
                
                <div style={{ fontSize: 13, color: '#555' }}>
                  <strong>Allowed Operations:</strong> {financeAuth.authority.allowedOperations.join(', ')}
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'ooda' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button onClick={async () => { await chairmanFetch('/chairman/operating-loop/trigger', { method: 'POST', body: { trigger: 'chairman_manual' } }); load(); }} style={{ ...approveBtn, padding: '8px 16px', fontSize: 14 }}>
              Trigger OODA Cycle
            </button>
          </div>

          {oodaPending.length > 0 && (
            <Section title="Awaiting Your Approval">
              {oodaPending.map((c: any) => (
                <div key={c.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{c.trigger}</strong>
                      <StatusBadge status={c.phase} />
                      <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>
                        Recommendation: {(c.recommendation as any)?.title || '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', color: '#999', fontSize: 12 }}>{new Date(c.startedAt).toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={async () => { await chairmanFetch(`/chairman/operating-loop/cycle/${c.id}/verdict`, { method: 'POST', body: { verdict: 'APPROVED' } }); load(); }} style={approveBtn}>Approve</button>
                      <button onClick={async () => { await chairmanFetch(`/chairman/operating-loop/cycle/${c.id}/verdict`, { method: 'POST', body: { verdict: 'REJECTED' } }); load(); }} style={rejectBtn}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          <Section title="Recent OODA Cycles">
            {oodaCycles.length === 0 && <p style={{ color: '#888' }}>No cycles yet. Trigger one or wait for the business loop.</p>}
            {oodaCycles.map((c: any) => (
              <div key={c.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{c.trigger}</strong>
                    <StatusBadge status={c.phase} />
                    {c.chairmanVerdict && <span style={{ marginLeft: 8, fontSize: 11, color: c.chairmanVerdict === 'APPROVED' ? '#10b981' : '#ef4444' }}>{c.chairmanVerdict}</span>}
                  </div>
                  <span style={{ color: '#999', fontSize: 12 }}>{new Date(c.startedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </Section>

          {agentPerf && (
            <Section title="AI Agent Performance">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Stat label="Total Agents" value={agentPerf.summary?.totalAgents ?? 0} />
                <Stat label="Avg Quality" value={`${agentPerf.summary?.avgQuality ?? 0}%`} />
                <Stat label="Avg Productivity" value={`${agentPerf.summary?.avgProductivity ?? 0}%`} />
                <Stat label="Success Rate" value={`${agentPerf.summary?.companySuccessRate ?? 0}%`} />
              </div>
              {(agentPerf.agents || []).map((a: any) => (
                <div key={a.employeeId} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{a.name}</strong>
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>{a.department} · {a.role}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <span>Quality: {a.qualityScore}%</span>
                    <span>Tasks: {a.tasksCompleted}</span>
                    <span>Late: {a.tasksLate}</span>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function buildQuery(f: { status?: string; riskLevel?: string }): string {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.riskLevel) p.set('riskLevel', f.riskLevel);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AWAITING_APPROVAL: '#f59e0b', EXECUTING: '#3b82f6', COMPLETED: '#10b981', FAILED: '#ef4444', REJECTED: '#6b7280',
    PROPOSED: '#f59e0b', APPROVED: '#10b981', CANCELLED: '#6b7280', UNREAD: '#f59e0b', READ: '#3b82f6', RESOLVED: '#10b981',
  };
  return <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${colors[status] || '#888'}20`, color: colors[status] || '#888' }}>{status}</span>;
}

const riskColors: Record<string, string> = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' };

function CommandRow({ cmd, onApprove, onReject }: { cmd: Command; onApprove?: () => void; onReject?: () => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 500 }}>{cmd.naturalLanguage}</span>
          <StatusBadge status={cmd.status} />
          <span style={{ marginLeft: 8, fontSize: 11, color: riskColors[cmd.riskLevel] || '#888' }}>{cmd.riskLevel} risk</span>
          {cmd.executionNotes && <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>{cmd.executionNotes}</p>}
          <p style={{ margin: '2px 0 0', color: '#999', fontSize: 12 }}>{new Date(cmd.createdAt).toLocaleString()}</p>
        </div>
        {(onApprove || onReject) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {onApprove && <button onClick={onApprove} style={approveBtn}>Approve</button>}
            {onReject && <button onClick={onReject} style={rejectBtn}>Reject</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert, onResolve, onRead }: { alert: Alert; onResolve: () => void; onRead: () => void }) {
  const sevColor: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#3b82f6', LOW: '#10b981' };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 500 }}>{alert.title}</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: sevColor[alert.severity] || '#888' }}>{alert.severity}</span>
          <StatusBadge status={alert.status} />
          <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>{alert.description}</p>
          <p style={{ margin: '2px 0 0', color: '#999', fontSize: 12 }}>{alert.category} · {new Date(alert.createdAt).toLocaleString()}</p>
        </div>
        {alert.status !== 'RESOLVED' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {alert.status === 'UNREAD' && <button onClick={onRead} style={{ ...approveBtn, background: '#3b82f6' }}>Mark Read</button>}
            <button onClick={onResolve} style={approveBtn}>Resolve</button>
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', marginBottom: 8 };
const approveBtn: React.CSSProperties = { padding: '4px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const rejectBtn: React.CSSProperties = { padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 };
