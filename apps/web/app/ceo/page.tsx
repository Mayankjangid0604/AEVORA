'use client';

import { useState, useEffect } from 'react';
import { API_BASE, authHeaders, getToken } from '../lib/api';

interface Objective {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  progress: number;
}

interface Decision {
  id: string;
  title: string;
  type: string;
  status: string;
  proposedAt: string;
}

interface AutonomousDecision {
  id: string;
  category: string;
  triggerType: string;
  situation: string;
  observations: string;
  proposedAction: string;
  riskLevel: string;
  confidence: string;
  approvalStatus: string;
  executionStatus: string;
  executionResult: string;
  createdAt: string;
}

interface Command {
  id: string;
  naturalLanguage: string;
  status: string;
  riskLevel: string;
  createdAt: string;
}

interface DepartmentBudget {
  id: string;
  departmentName?: string;
  allocatedAmount: number;
  spentAmount: number;
  committedAmount: number;
  status: string;
}

interface CompanyBudget {
  id: string;
  name: string;
  period: string;
  totalAmount: number;
  allocatedAmount: number;
  spentAmount: number;
  committedAmount: number;
  status: string;
  departmentBudgets: DepartmentBudget[];
}

interface CeoFinancialAuthority {
  active: boolean;
  authority?: {
    id: string;
    authorityStatus: string;
    singleTransactionLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    budgetLimit: boolean;
    allowedOperations: string[];
    requiresChairmanApprovalAbove: number | null;
  };
  usage?: {
    dailyUsed: number;
    monthlyUsed: number;
  };
}

interface CeoState {
  objectives: Objective[];
  pendingDecisions: Decision[];
  recentCommands: Command[];
  autonomousDecisions: AutonomousDecision[];
  budgets: CompanyBudget[];
  financeAuth: CeoFinancialAuthority;
  strategicHealth?: any;
  evaluations?: any[];
  successionPlans?: any[];
}

export default function CeoOSPage() {
  const [state, setState] = useState<CeoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newPriority, setNewPriority] = useState({ title: '', description: '', priority: 'NORMAL' });
  const [newTask, setNewTask] = useState({ leadRoleTitle: 'Sales Lead', title: '', description: '', priority: 'NORMAL' });

  const token = typeof window !== 'undefined' ? getToken() : null;

  const load = async () => {
    if (!token) return;
    try {
      const [osRes, autoRes, budgetRes, authRes, shRes] = await Promise.all([
        fetch(`${API_BASE}/ceo/operating-state`, { headers: authHeaders() }),
        fetch(`${API_BASE}/ceo/autonomous-decisions`, { headers: authHeaders() }),
        fetch(`${API_BASE}/ceo/budgets`, { headers: authHeaders() }),
        fetch(`${API_BASE}/ceo/financial-authority`, { headers: authHeaders() }),
        fetch(`${API_BASE}/ceo/strategy/health`, { headers: authHeaders() }).catch(() => null)
      ]);
      if (!osRes.ok) throw new Error(await osRes.text());
      if (!autoRes.ok) throw new Error(await autoRes.text());
      // don't fail entire page if budget fails while we are building it
      let budgets = [];
      if (budgetRes.ok) budgets = await budgetRes.json();
      
      let financeAuth = { active: false };
      if (authRes && authRes.ok) financeAuth = await authRes.json();

      let strategicHealth = null;
      if (shRes && shRes.ok) strategicHealth = await shRes.json();

      const osState = await osRes.json();
      const autoDecisions = await autoRes.json();
      
      setState({
         ...osState,
         autonomousDecisions: autoDecisions,
         budgets,
         financeAuth,
         strategicHealth
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runDecisionLoop = async () => {
    try {
      const res = await fetch(`${API_BASE}/ceo/autonomous-decisions/run`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const executeDecision = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/ceo/autonomous-decisions/${id}/execute`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const approveDecision = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/ceo/autonomous-decisions/${id}/approve`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const rejectDecision = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/ceo/autonomous-decisions/${id}/reject`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [token]);

  const addPriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriority.title) return;
    try {
      const res = await fetch(`${API_BASE}/ceo/priorities`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newPriority),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewPriority({ title: '', description: '', priority: 'NORMAL' });
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const delegateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title) return;
    try {
      const res = await fetch(`${API_BASE}/ceo/delegate`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewTask({ ...newTask, title: '', description: '' });
      alert('Task delegated successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!token) return <div className="p-8">Authentication required.</div>;
  if (loading) return <div className="p-8 text-center text-gray-400">Loading CEO OS...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>CEO Operating System</h1>
        <p style={{ color: '#9ca3af', margin: '4px 0 0' }}>Manage priorities, decisions, and delegate to department leads.</p>
      </div>

      {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: 12, borderRadius: 8, marginBottom: 24 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        {/* Strategic Planning */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Strategic Planning</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Strategic Health</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: state?.strategicHealth?.status === 'HEALTHY' ? '#10b981' : state?.strategicHealth?.status === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>
                {state?.strategicHealth?.status || 'UNKNOWN'}
              </div>
            </div>
            <div style={{ flex: 2, minWidth: 300 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Health Indicators</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state?.strategicHealth?.reasons?.map((r: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, background: '#111827', padding: '6px 12px', borderRadius: 4 }}>{r}</div>
                )) || <div style={{ fontSize: 13, color: '#6b7280' }}>No active strategy</div>}
              </div>
            </div>
          </div>
        </section>

        {/* Priorities */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Company Priorities</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {state?.objectives.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>No priorities set.</div>}
            {state?.objectives.map(o => (
              <div key={o.id} style={{ background: '#111827', padding: 12, borderRadius: 8, borderLeft: `4px solid ${o.priority === 'CRITICAL' ? '#ef4444' : o.priority === 'HIGH' ? '#f97316' : '#3b82f6'}` }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</div>
                {o.description && <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>{o.description}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Progress: {o.progress}%</span>
                  <span style={{ fontSize: 10, background: '#374151', padding: '2px 6px', borderRadius: 4 }}>{o.priority}</span>
                </div>
              </div>
            ))}
          </div>
          
          <form onSubmit={addPriority} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #374151', paddingTop: 16 }}>
            <input placeholder="New priority title..." value={newPriority.title} onChange={e => setNewPriority({ ...newPriority, title: e.target.value })} style={{ padding: 8, background: '#111827', border: '1px solid #374151', borderRadius: 6, color: 'white' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newPriority.priority} onChange={e => setNewPriority({ ...newPriority, priority: e.target.value })} style={{ flex: 1, padding: 8, background: '#111827', border: '1px solid #374151', borderRadius: 6, color: 'white' }}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <button type="submit" style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>Add</button>
            </div>
          </form>
        </section>

        {/* Directives & Delegation */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Directives */}
          <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Chairman Directives</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {state?.recentCommands.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>No recent directives.</div>}
              {state?.recentCommands.map(c => (
                <div key={c.id} style={{ background: '#111827', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 14 }}>&quot;{c.naturalLanguage}&quot;</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    <span style={{ fontSize: 10, background: c.status === 'COMPLETED' ? '#065f46' : '#7f1d1d', color: 'white', padding: '2px 6px', borderRadius: 4 }}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delegation */}
          <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Delegate to Leads</h2>
            <form onSubmit={delegateTask} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={newTask.leadRoleTitle} onChange={e => setNewTask({ ...newTask, leadRoleTitle: e.target.value })} style={{ padding: 8, background: '#111827', border: '1px solid #374151', borderRadius: 6, color: 'white' }}>
                <option value="Sales Lead">Sales Lead</option>
                <option value="Marketing Lead">Marketing Lead</option>
                <option value="Engineering Lead">Engineering Lead</option>
                <option value="HR Lead">HR Lead</option>
              </select>
              <input placeholder="Task title..." value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} style={{ padding: 8, background: '#111827', border: '1px solid #374151', borderRadius: 6, color: 'white' }} />
              <textarea placeholder="Task description..." value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} style={{ padding: 8, background: '#111827', border: '1px solid #374151', borderRadius: 6, color: 'white', minHeight: 60 }} />
              <button type="submit" style={{ background: '#059669', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}>Delegate Task</button>
            </form>
          </div>
        </section>

        {/* Decision Center */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Decision Center</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state?.pendingDecisions.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>No pending decisions.</div>}
            {state?.pendingDecisions.map(d => (
              <div key={d.id} style={{ background: '#111827', padding: 12, borderRadius: 8, borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{d.type}</span>
                  <span style={{ fontSize: 10, background: '#4c1d95', color: '#ddd6fe', padding: '2px 6px', borderRadius: 4 }}>Awaiting CEO</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Budget Management */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Budget Management</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {state?.budgets && state.budgets.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>No budgets found.</div>}
            {state?.budgets && state.budgets.map(b => {
              const util = b.totalAmount > 0 ? (b.spentAmount + b.committedAmount) / b.totalAmount : 0;
              return (
                <div key={b.id} style={{ background: '#111827', padding: 16, borderRadius: 8, borderLeft: `4px solid ${util >= 0.9 ? '#ef4444' : '#10b981'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                     <div style={{ fontWeight: 600, fontSize: 16, color: '#f3f4f6' }}>{b.name}</div>
                     <span style={{ fontSize: 10, background: b.status === 'ACTIVE' ? '#065f46' : '#374151', color: 'white', padding: '2px 8px', borderRadius: 12 }}>{b.status}</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Total Budget</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>${b.totalAmount.toLocaleString()}</div>
                    </div>
                    <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Allocated</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#60a5fa' }}>${b.allocatedAmount.toLocaleString()}</div>
                    </div>
                    <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Spent + Reserved</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: util >= 0.9 ? '#ef4444' : '#f59e0b' }}>${(b.spentAmount + b.committedAmount).toLocaleString()}</div>
                    </div>
                    <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Remaining</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>${(b.totalAmount - b.spentAmount - b.committedAmount).toLocaleString()}</div>
                    </div>
                  </div>

                  {b.departmentBudgets && b.departmentBudgets.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>DEPARTMENT ALLOCATIONS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {b.departmentBudgets.map(db => (
                          <div key={db.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#1f2937', padding: 8, borderRadius: 4, fontSize: 13 }}>
                            <span style={{ color: '#d1d5db' }}>{db.departmentName || db.id.substring(0, 8)}</span>
                            <span style={{ fontWeight: 600, color: '#9ca3af' }}>${(db.spentAmount + db.committedAmount).toLocaleString()} / ${db.allocatedAmount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Financial Authority */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>CEO Financial Authority</h2>
          </div>
          
          {!state?.financeAuth?.active || !state?.financeAuth?.authority ? (
             <div style={{ color: '#6b7280', fontSize: 14 }}>The CEO currently has no delegated financial authority.</div>
          ) : (
             <div style={{ background: '#111827', padding: 16, borderRadius: 8, borderLeft: `4px solid ${state.financeAuth.authority.authorityStatus === 'ACTIVE' ? '#10b981' : '#ef4444'}` }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                 <div style={{ fontWeight: 600, fontSize: 16, color: '#f3f4f6' }}>Authority Status</div>
                 <span style={{ fontSize: 10, background: state.financeAuth.authority.authorityStatus === 'ACTIVE' ? '#065f46' : '#991b1b', color: 'white', padding: '2px 8px', borderRadius: 12 }}>{state.financeAuth.authority.authorityStatus}</span>
               </div>
               
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                 <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                   <div style={{ fontSize: 11, color: '#9ca3af' }}>Per Transaction Limit</div>
                   <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>₹{state.financeAuth.authority.singleTransactionLimit.toLocaleString()}</div>
                 </div>
                 <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                   <div style={{ fontSize: 11, color: '#9ca3af' }}>Daily Limit</div>
                   <div style={{ fontSize: 15, fontWeight: 600, color: '#60a5fa' }}>₹{state.financeAuth.authority.dailyLimit.toLocaleString()}</div>
                   <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Used: ₹{state.financeAuth.usage?.dailyUsed?.toLocaleString() || 0}</div>
                 </div>
                 <div style={{ background: '#1f2937', padding: 10, borderRadius: 6 }}>
                   <div style={{ fontSize: 11, color: '#9ca3af' }}>Monthly Limit</div>
                   <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>₹{state.financeAuth.authority.monthlyLimit.toLocaleString()}</div>
                   <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Used: ₹{state.financeAuth.usage?.monthlyUsed?.toLocaleString() || 0}</div>
                 </div>
               </div>

               <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#d1d5db', marginBottom: 12 }}>
                 <div>
                    <strong>Subject to Budgets:</strong> {state.financeAuth.authority.budgetLimit ? 'Yes' : 'No'}
                 </div>
                 <div>
                    <strong>Chairman Approval Above:</strong> {state.financeAuth.authority.requiresChairmanApprovalAbove ? `₹${state.financeAuth.authority.requiresChairmanApprovalAbove.toLocaleString()}` : 'N/A'}
                 </div>
               </div>
               
               <div style={{ fontSize: 13, color: '#d1d5db' }}>
                 <strong>Allowed Operations:</strong>
                 <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                   {state.financeAuth.authority.allowedOperations.map(op => (
                     <span key={op} style={{ background: '#374151', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>{op}</span>
                   ))}
                 </div>
               </div>
             </div>
          )}
        </section>

        {/* Performance & Succession */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Performance & Succession</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {/* Performance */}
            <div style={{ background: '#111827', padding: 16, borderRadius: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f3f4f6', marginBottom: 12 }}>Recent Evaluations</h3>
              {!state?.evaluations?.length ? (
                 <div style={{ color: '#6b7280', fontSize: 13 }}>No recent performance evaluations.</div>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                   {state.evaluations.slice(0, 3).map((e: any) => (
                     <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1f2937', padding: '8px 12px', borderRadius: 6 }}>
                       <div>
                         <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{e.employee?.name || e.employeeId}</div>
                         <div style={{ fontSize: 11, color: '#9ca3af' }}>Score: {e.overallScore.toFixed(1)}</div>
                       </div>
                       <span style={{ fontSize: 10, background: e.status === 'EXCEPTIONAL' ? '#065f46' : e.status === 'CRITICAL' || e.status === 'UNDERPERFORMING' ? '#7f1d1d' : '#374151', color: 'white', padding: '2px 8px', borderRadius: 12 }}>
                         {e.status}
                       </span>
                     </div>
                   ))}
                 </div>
              )}
            </div>

            {/* Succession */}
            <div style={{ background: '#111827', padding: 16, borderRadius: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f3f4f6', marginBottom: 12 }}>Succession Pipeline</h3>
              {!state?.successionPlans?.length ? (
                 <div style={{ color: '#6b7280', fontSize: 13 }}>No critical succession plans.</div>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                   {state.successionPlans.slice(0, 3).map((p: any) => (
                     <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1f2937', padding: '8px 12px', borderRadius: 6, borderLeft: `3px solid ${p.riskLevel === 'CRITICAL' ? '#ef4444' : p.riskLevel === 'HIGH' ? '#f59e0b' : '#10b981'}` }}>
                       <div>
                         <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>Role: {p.roleId}</div>
                         <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.candidates?.length || 0} candidate(s)</div>
                       </div>
                       <span style={{ fontSize: 10, color: '#d1d5db' }}>
                         Risk: {p.riskLevel}
                       </span>
                     </div>
                   ))}
                 </div>
              )}
            </div>
          </div>
        </section>

        {/* Autonomous Decisions */}
        <section style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Autonomous Decisions (AI CEO)</h2>
             <button onClick={runDecisionLoop} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Run Loop</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state?.autonomousDecisions.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>No autonomous decisions found.</div>}
            {state?.autonomousDecisions.map(d => (
              <div key={d.id} style={{ background: '#111827', padding: 16, borderRadius: 8, borderLeft: `4px solid ${d.riskLevel === 'HIGH' || d.riskLevel === 'CRITICAL' ? '#ef4444' : '#10b981'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                   <div style={{ fontWeight: 600, fontSize: 15, color: '#f3f4f6', marginBottom: 4 }}>{d.triggerType.replace(/_/g, ' ')}</div>
                   <div style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(d.createdAt).toLocaleString()}</div>
                </div>
                
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>{d.situation}</div>
                
                <div style={{ background: '#374151', padding: 8, borderRadius: 6, fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                  <strong>Observations:</strong> {d.observations}
                </div>

                <div style={{ fontSize: 13, color: '#e5e7eb', marginBottom: 12 }}>
                   <strong>CEO Proposed Action:</strong> {d.proposedAction}
                </div>
                
                {d.executionResult && (
                  <div style={{ background: d.executionStatus === 'FAILED' ? '#7f1d1d' : d.executionStatus === 'EXECUTED' ? '#065f46' : '#4b5563', padding: 8, borderRadius: 6, fontSize: 12, color: 'white', marginBottom: 12 }}>
                    <strong>Result:</strong> {d.executionResult}
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 10, background: '#374151', padding: '2px 6px', borderRadius: 4 }}>Risk: {d.riskLevel}</span>
                    <span style={{ fontSize: 10, background: '#374151', padding: '2px 6px', borderRadius: 4 }}>Auth: {d.approvalStatus === 'NOT_REQUIRED' ? 'AUTONOMOUS' : 'APPROVAL REQ'}</span>
                    <span style={{ fontSize: 10, background: d.executionStatus === 'EXECUTED' ? '#065f46' : d.executionStatus === 'PENDING' ? '#b45309' : '#7f1d1d', color: 'white', padding: '2px 6px', borderRadius: 4 }}>{d.executionStatus}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                     {d.executionStatus === 'PENDING' && d.approvalStatus === 'NOT_REQUIRED' && (
                        <button onClick={() => executeDecision(d.id)} style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Execute Action</button>
                     )}
                     
                     {d.executionStatus === 'PENDING' && d.approvalStatus === 'PENDING' && (
                        <>
                           <button onClick={() => approveDecision(d.id)} style={{ background: '#059669', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Approve</button>
                           <button onClick={() => rejectDecision(d.id)} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Reject</button>
                        </>
                     )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
