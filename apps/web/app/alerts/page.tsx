'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/ui';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.alerts().then(res => {
      if (res.error) setError(res.error);
      else setAlerts(res.data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="state-loading">Loading alerts…</div>;
  if (error) return <div className="state-error">⚠ {error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Operational Alerts</h2>
        <p>{alerts.length} alerts</p>
      </div>

      {alerts.length === 0 ? (
        <div className="state-empty">No active alerts — systems nominal ✓</div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Severity</th><th>Category</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {alerts.map((alert: any) => (
              <tr key={alert.id}>
                <td><StatusBadge status={alert.severity} /></td>
                <td>{alert.category}</td>
                <td>{alert.title}<br/><span style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>{alert.description}</span></td>
                <td><StatusBadge status={alert.status} /></td>
                <td style={{color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'}}>{new Date(alert.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
