'use client';

import { useEffect, useState } from 'react';

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

export default function CustomerOperationsPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/customer-operations/customers'),
      apiFetch('/customer-operations/projects'),
    ]).then(([cRes, pRes]) => {
      if (!cRes.error) setCustomers(cRes.data || []);
      if (!pRes.error) setProjects(pRes.data || []);
      if (cRes.error && pRes.error) setError('Authentication required — please log in first');
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading customer operations…</div>;

  const statusColors: Record<string, string> = {
    ACTIVE: '#22c55e', AT_RISK: '#f59e0b', ONBOARDING: '#3b82f6',
    CHURNED: '#ef4444', COMPLETED: '#6b7280', SUSPENDED: '#f97316',
  };

  const projectStatusColors: Record<string, string> = {
    PLANNED: '#6b7280', ONBOARDING: '#3b82f6', ACTIVE: '#22c55e',
    BLOCKED: '#ef4444', IN_QA: '#a855f7', DELIVERED: '#06b6d4',
    ACCEPTED: '#22c55e', COMPLETED: '#6b7280', CANCELLED: '#ef4444',
  };

  return (
    <>
      <div className="page-header">
        <h2>Customer Operations</h2>
        <p>Repeatable delivery &amp; account management</p>
      </div>

      {error && <div className="state-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div className="metric-card">
          <div className="metric-value">{customers.length}</div>
          <div className="metric-label">Active Customers</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{projects.length}</div>
          <div className="metric-label">Active Projects</div>
        </div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Customer Portfolio</h3>
        {customers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No customers found</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Organisation</th>
                  <th>Status</th>
                  <th>Contacts</th>
                  <th>Projects</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td>{c.organizationName ?? '-'}</td>
                    <td>
                      <span style={{
                        background: statusColors[c.status] ?? '#6b7280',
                        color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12,
                      }}>{c.status}</span>
                    </td>
                    <td>{c.contacts?.length ?? 0}</td>
                    <td>{c.projects?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: 12 }}>Project Portfolio</h3>
        {projects.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No projects found</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Tasks</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>{p.client?.name ?? '-'}</td>
                    <td>
                      <span style={{
                        background: projectStatusColors[p.status] ?? '#6b7280',
                        color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12,
                      }}>{p.status}</span>
                    </td>
                    <td>{p.tasks?.length ?? 0}</td>
                    <td>{p.quotedPrice ? `₹${(p.quotedPrice / 100).toLocaleString()}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
